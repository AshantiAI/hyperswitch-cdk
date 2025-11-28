import {
  Fn,
  aws_ec2 as ec2,
  aws_ssm as ssm,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ParamStore } from './param-store';

export interface ImportedVpcProps {
  readonly maxAzs?: number;
  readonly includeVpcCidr?: boolean;
  readonly includePublicSubnets?: boolean;
  readonly includePublicSubnetRouteTables?: boolean;
  readonly includePublicSubnetCidrs?: boolean;
  readonly includePrivateSubnets?: boolean;
  readonly includePrivateSubnetRouteTables?: boolean;
  readonly includePrivateSubnetCidrs?: boolean;
  readonly includeIsolatedSubnets?: boolean;
  readonly includeIsolatedSubnetRouteTables?: boolean;
  readonly includeIsolatedSubnetCidrs?: boolean;
}

export class ImportedVpc {

  public static FromSSM(scope: Construct, props: ImportedVpcProps): ec2.IVpc {

    const {
      maxAzs = 1,
      includeVpcCidr = true,
      includePublicSubnets = true,
      includePublicSubnetRouteTables = true,
      includePublicSubnetCidrs = true,
      includePrivateSubnets = true,
      includePrivateSubnetRouteTables = true,
      includePrivateSubnetCidrs = true,
      includeIsolatedSubnets = true,
      includeIsolatedSubnetRouteTables = true,
      includeIsolatedSubnetCidrs = true,
    } = props;

    // Import VPC from SSM parameters
    // https://github.com/aws/aws-cdk/issues/7506

    // Required attributes
    const vpcId = ssm.StringParameter.valueForStringParameter(
      scope,
      ParamStore.vpc().SSM_VPC_ID_PARAM.value
    );
    const availabilityZonesParam = ssm.StringListParameter.valueForTypedListParameter(
      scope,
      ParamStore.vpc().SSM_VPC_AZS_PARAM.value,
    );
    const availabilityZones = Array.from({ length: maxAzs }, (_, i) => Fn.select(i, availabilityZonesParam));
    const vpcCidrBlock = this.valueForStringParameter(scope, includeVpcCidr, ParamStore.vpc().SSM_VPC_CIDR_PARAM.value);
    const privateSubnetIds = this.valueForStringListParameter(scope, includePrivateSubnets, maxAzs, ParamStore.vpc().SSM_VPC_PRIVATE_SUBNET_IDS_PARAM.value);
    const privateSubnetRouteTableIds = this.valueForStringListParameter(scope, includePrivateSubnetRouteTables, maxAzs, ParamStore.vpc().SSM_VPC_PRIVATE_SUBNET_ROUTE_TABLE_IDS_PARAM.value);
    const privateSubnetIpv4CidrBlocks = this.valueForStringListParameter(scope, includePrivateSubnetCidrs, maxAzs, ParamStore.vpc().SSM_VPC_PRIVATE_SUBNET_IPV4_CIDR_BLOCKS_PARAM.value);
    const publicSubnetIds = this.valueForStringListParameter(scope, includePublicSubnets, maxAzs, ParamStore.vpc().SSM_VPC_PUBLIC_SUBNET_IDS_PARAM.value);
    const publicSubnetRouteTableIds = this.valueForStringListParameter(scope, includePublicSubnetRouteTables, maxAzs, ParamStore.vpc().SSM_VPC_PUBLIC_SUBNET_ROUTE_TABLE_IDS_PARAM.value);
    const publicSubnetIpv4CidrBlocks = this.valueForStringListParameter(scope, includePublicSubnetCidrs, maxAzs, ParamStore.vpc().SSM_VPC_PUBLIC_SUBNET_IPV4_CIDR_BLOCKS_PARAM.value);
    const isolatedSubnetIds = this.valueForStringListParameter(scope, includeIsolatedSubnets, maxAzs, ParamStore.vpc().SSM_VPC_ISOLATED_SUBNET_IDS_PARAM.value);
    const isolatedSubnetRouteTableIds = this.valueForStringListParameter(scope, includeIsolatedSubnetRouteTables, maxAzs, ParamStore.vpc().SSM_VPC_ISOLATED_SUBNET_ROUTE_TABLE_IDS_PARAM.value);
    const isolatedSubnetIpv4CidrBlocks = this.valueForStringListParameter(scope, includeIsolatedSubnetCidrs, maxAzs, ParamStore.vpc().SSM_VPC_ISOLATED_SUBNET_IPV4_CIDR_BLOCKS_PARAM.value);

    return ec2.Vpc.fromVpcAttributes(scope, 'ImportedVpc', {
      vpcId,
      availabilityZones,
      vpcCidrBlock,
      privateSubnetIds,
      privateSubnetRouteTableIds,
      privateSubnetIpv4CidrBlocks,
      publicSubnetIds,
      publicSubnetRouteTableIds,
      publicSubnetIpv4CidrBlocks,
      isolatedSubnetIds,
      isolatedSubnetRouteTableIds,
      isolatedSubnetIpv4CidrBlocks,
    });
  }

  private static valueForStringParameter(scope: Construct, include: boolean, parameterName: string): string | undefined {
    if (!include) {
      return undefined;
    }
    return ssm.StringParameter.valueForStringParameter(scope, parameterName);
  }

  private static valueForStringListParameter(scope: Construct, include: boolean, maxAzs: number, parameterName: string): string[] | undefined {
    if (!include) {
      return undefined;
    }
    const value = ssm.StringListParameter.valueForTypedListParameter(scope, parameterName);
    return Array.from({ length: maxAzs }, (_, i) => Fn.select(i, value));
  }
}
