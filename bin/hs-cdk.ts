#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Configuration } from "../awsconfig";
import { HyperswitchInfraStack } from "../lib/aws/hyperswitch-infra-stack";
import { HyperswitchDatabaseStack } from "../lib/aws/hyperswitch-database-stack";
import { HyperswitchElasticacheStack } from "../lib/aws/hyperswitch-elasticache-stack";
import { HyperswitchAppStack } from "../lib/aws/hyperswitch-app-stack";
import { HyperswitchMigrationStack } from "../lib/aws/hyperswitch-migration-stack";

const app = new cdk.App();

// Set context before creating stacks
type AccountRegion = {
  account?: string;
  region?: string;
};
const currentAccount: AccountRegion = {
  region: process.env.CDK_DEFAULT_REGION || undefined,
  account: process.env.CDK_DEFAULT_ACCOUNT || undefined,
};

if (!process.env.CDK_DEFAULT_REGION) {
  throw Error("please do `export CDK_DEFAULT_REGION=<your region>`");
}
app.node.setContext("currentAccount", currentAccount);

// Load config and deploy stacks
let config = new Configuration(app).getConfig();

// Create infrastructure stack (VPC, networking, locker)
const infraStack = new HyperswitchInfraStack(app, config);

// Create database stack (RDS)
const databaseStack = new HyperswitchDatabaseStack(app, `${config.stack.name}-database`, {
  config: config,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
databaseStack.addDependency(infraStack);

// Create ElastiCache stack (Redis)
const elasticacheStack = new HyperswitchElasticacheStack(app, `${config.stack.name}-elasticache`, {
  config: config,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
elasticacheStack.addDependency(infraStack);

// Create migration stack
const migrationStack = new HyperswitchMigrationStack(app, `${config.stack.name}-migration-2`, {
  config: config,
  useVpc: config.rds.subnetType !== ec2.SubnetType.PUBLIC,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
migrationStack.addDependency(databaseStack);

// Create application stack (includes migration trigger, reads from SSM)
const appStack = new HyperswitchAppStack(app, config);
appStack.addDependency(infraStack);
appStack.addDependency(databaseStack);
appStack.addDependency(elasticacheStack);
appStack.addDependency(migrationStack);

