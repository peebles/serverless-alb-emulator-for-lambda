# Serverless ALB Emulator for Lambda

## Quick Start

```sh
npm install @peebles/serverless-alb-emulator-for-lambda
npx sls offline start
npx alb --stage development serverless.yml
```

The ALB endpoint will be http://localhost:3000.  You can change the port with an environment variable; `ALB_PORT`.  The ALB interacts with the `serverless-offline` plugin, using the default endpoint http://localhost:3002.  The ALB will honor `serverless-offline.lambdaPort` if it is defined in the serverless.yml file.  You can entirely override the serverless function call endpoint with an environment variable; `SERVERLESS_LAMBDA_ENDPOINT` by setting it to something like "http://sls:3003".

Only the "path" condition is considered when routing ALB requests to functions.

## When to use this package

You can already define an ALB and its listeners as resources in a serverless.yml file, and then `serverless-offline` plugin will emulate this.  When you deploy to AWS, the ALB and related resources will be created.

Use this package if you don't want to (or can't) include the ALB resources in your serverless.yml file.  This might be the case if your ALB already exists in AWS, created manually or by some other stack mechanism.  Your serverless.yml file might look something like this:

```yaml
...

functions:
  my-function:
    ...
    events:
      - alb:
        listenerArn: arn:aws:elasticloadbalancing:us-east-1:xxxxx:listener/....
        conditions:
          path: "/*"

...
```

In this case serverless will not create an ALB or any listeners.  It will create a target group pointing to your lambda function and attach it to the existing listener specified by the existing arn.

And in this case, the `serverless-offline` plugin will not create an ALB.  So this package is useful to emulate an ALB in this situation.  The ALB is a simple http server that will proxy your http calls to the correct functions based on the defined event conditions.

## Deployment Suggestions

You'll have to run `sls offline start` and `alb` in parallel.  You might do this in your package.json file using the "concurrently" package:

```sh
npm install --save-dev concurrently
```

and in package.json:

```json
"scripts": {
  "start-serverless": "sls offline start",
  "start-alb": "ALB_PORT=8080 alb --stage local serverless.yml",
  "start": "concurrently --kill-others \"npm run start-serverless\" \"npm run start-alb\""
}
```

