import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { Config } from "./config";
import { LockerSetup } from "./card-vault/components";
import { ImportedVpc } from "./constructs/imported-vpc";

export interface HyperswitchInfraStackOutputs {
    vpc: ec2.Vpc;
    locker?: LockerSetup;
}

export class HyperswitchInfraStack extends cdk.Stack implements HyperswitchInfraStackOutputs {
    public readonly vpc: ec2.Vpc;
    public readonly locker?: LockerSetup;

    constructor(scope: Construct, config: Config) {
        super(scope, `${config.stack.name}-infra`, {
            env: {
                account: process.env.CDK_DEFAULT_ACCOUNT,
                region: process.env.CDK_DEFAULT_REGION
            },
            stackName: `${config.stack.name}-infra`,
        });

        cdk.Tags.of(this).add("Stack", "Hyperswitch-Infrastructure");
        cdk.Tags.of(this).add("StackName", `${config.stack.name}-infra`);

        Object.entries(config.tags).forEach(([key, value]) => {
            cdk.Tags.of(this).add(key, value);
        });

        // Import VPC from SSM parameters (created by VpcStack)
        // Uses public subnets only for minimal cost (no NAT Gateway)
        this.vpc = ImportedVpc.FromSSM(this, {
            maxAzs: config.vpc.maxAzs,
            includePrivateSubnets: false,
            includePrivateSubnetRouteTables: false,
            includePrivateSubnetCidrs: false,
            includeIsolatedSubnets: false,
            includeIsolatedSubnetRouteTables: false,
            includeIsolatedSubnetCidrs: false
        }) as ec2.Vpc;

        // Optional: Locker setup
        if (config.locker.master_key) {
            this.locker = new LockerSetup(this, this.vpc, config.locker);
        }
    }
}
