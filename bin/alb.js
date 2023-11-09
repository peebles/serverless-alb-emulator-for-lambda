#!/usr/bin/env node

const Lambda = require('aws-sdk/clients/lambda');
const express = require('express');
const Logger = require( 'simple-cw-logger' );
const yaml = require('js-yaml');
const _ = require('lodash');

const ALB_PORT = process.env.ALB_PORT || 3000;

let app = module.exports = express();
app.log = new Logger({level: "debug"});

let args = require('yargs').argv;
let {stage} = args;
let yamlFile = args._[0];

if (!(stage && yamlFile)) {
  console.log(`Usage: ${process.argv[1]} --stage <stage> <serverless.yml>`);
  process.setUncaughtExceptionCaptureCallback(1);
}

const yml = yaml.load(require('fs').readFileSync(yamlFile, 'utf8'));

let service = yml.service;
if (typeof service === 'object') service = service.name;

let PathExpressions = [];
Object.keys(yml.functions).forEach(f => {
  let name = `${service}-${stage}-${f}`;
  if (yml.functions[f].events) {
    yml.functions[f].events.forEach(e => {
      if (e.alb) {
        let conditions = e.alb.conditions;
        if (conditions) {
          if (conditions.path) {
            PathExpressions.push({
              path: new RegExp(conditions.path),
              functionName: name,
            });
          }
        }
      }
    });
  }
});

const LambdaPort = _.get(yml, 'serverless-offline.lambdaPort', 3002);
const LambdaEndpoint = process.env.SERVERLESS_LAMBDA_ENDPOINT || `http://localhost:${LambdaPort}`;
const lambda = new Lambda({
  region: "us-east-1",
  endpoint: LambdaEndpoint
});

const invoke = async(FunctionName, payload) => {
  let rs = await lambda.invoke({
    FunctionName,
    InvocationType: "RequestResponse",
    Payload: JSON.stringify(payload)
  }).promise();
  if (rs.FunctionError) {
    let pl = JSON.parse(rs.Payload);
    app.log.error(pl);
    throw new Error(`Error from "${FunctionName}": ${pl.errorType}: ${pl.errorMessage}`);
  }
  return JSON.parse(rs.Payload);
}

const getBodyBuffers = async(req) => {
  return new Promise((resolve, reject) => {
    let data = [];
    req.on('data', chunk => {
      data.push(chunk);
    })
    req.on('end', () => {
      resolve(Buffer.concat(data));
    })
  });
}

app.all("*", app.log.formatter(), async(req, res, cb) => {
  let query = req.query;
  let body = req.body;
  let headers = req.headers;
  let path = req.path;
  let method = req.method;

  // to handle file uploads properly; multipart/form-data
  body = await getBodyBuffers(req);

  // re-create an ALB lambda input event
  let event = {
    requestContext: {
      elb: {
        targetGroupArn: "some-arn-value"
      }
    },
    httpMethod: method,
    path,
    queryStringParameters: query,
    headers,
    body,
    isBase64Encoded: false
  };

  let match = _.find(PathExpressions, (e => e.path.test(path)));
  if (!match) return res.status(404).send(`No path extression matches "${path}"`);

  invoke(match.functionName, event).then(response => {
    if (response.multiValueHeaders) {
      let hdrs = {};
      Object.keys(response.multiValueHeaders).forEach(h => {
        hdrs[h] = response.multiValueHeaders[h][0];
      });
      res.set(hdrs);
    }
    if (response.headers) {
      res.set(response.headers);
    }
    res.status(response.statusCode).send(response.body);
  }).catch(err => {
    console.log(err);
    if (!cancelled) res.status(500).send(err.message);
  });
});

app.listen(ALB_PORT, () => {
  console.log(`ALB listening on ${ALB_PORT}`);
});
