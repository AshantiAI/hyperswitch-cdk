import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Config } from "./lib/aws/config";
import { Construct } from "constructs";
import { readFileSync, existsSync } from "fs";

export class Configuration {
  config: Config;
  constructor(scope: Construct) {
    let db_pass = scope.node.tryGetContext('db_pass') || "dbpassword";
    let admin_api_key = scope.node.tryGetContext('admin_api_key') || "test_admin";
    let jwt_secret = scope.node.tryGetContext('jwt_secret') || "secret";
    let master_enc_key = scope.node.tryGetContext('master_enc_key') || "73ad7bbbbc640c845a150f67d058b279849370cd2c1f3c67c4dd6c869213e13a";
    let tls_key_exists = existsSync("./rsa_sha256_key.pem");
    let tls_cert_exists = existsSync("./rsa_sha256_cert.pem");
    let ca_cert_exists = existsSync("./ca_cert.pem");
    let client_cert_exists = existsSync("./client_hyperswitch.pem");
    let config: Config = {
      stack: {
        name: "hyperswitch",
        region: process.env.CDK_DEFAULT_REGION || "us-east-1"
      },
      vpc: {
        name: "hyperswitch-vpc",
        maxAzs: 2,
      },
      subnet: {
        public: {
          name: "public"
        },
        dmz: {
          name: "private"
        }
      },
      keymanager: {
        enabled: scope.node.tryGetContext('keymanager_enabled') || false,
        name: "keymanager",
        db_user: "keymanager_db_user",
        db_pass: "pass1234",
        tls_key: tls_key_exists ? readFileSync("./rsa_sha256_key.pem").toString() : "",
        tls_cert: tls_cert_exists ? readFileSync("./rsa_sha256_cert.pem").toString() : "",
        ca_cert: ca_cert_exists ? readFileSync("./ca_cert.pem").toString() : "",
        client_cert: client_cert_exists ? readFileSync("./client_hyperswitch.pem").toString() : "",
        access_token: scope.node.tryGetContext('keymanager_access_token') || "secret123",
        hash_context: scope.node.tryGetContext('keymanager_hash_context') || "keymanager:hyperswitch",
      },
      extra_subnets: [],
      rds: {
        port: 5432,
        db_user: "db_user",
        db_name: "hyperswitch",
        password: db_pass,
        writer_instance_class: ec2.InstanceClass.T3,
        writer_instance_size: ec2.InstanceSize.MEDIUM,
        reader_instance_class: ec2.InstanceClass.T3,
        reader_instance_size: ec2.InstanceSize.MEDIUM,
        subnetType: ec2.SubnetType.PUBLIC,
        publiclyAccessible: true,
      },
      hyperswitch_ec2: {
        id: "hyperswitch",
        admin_api_key: admin_api_key,
        jwt_secret: jwt_secret,
        master_enc_key: master_enc_key,
        redis_host: "",
        db_host: "",
      },
      locker: {
        master_key: scope.node.tryGetContext('master_key'),
        db_user: "lockeruser",
        db_pass: scope.node.tryGetContext('locker_pass')

      },
      tags: {},
      versions: {
        hyperswitch_web: "0.127.0",
        hyperswitch_sdk: "v1",
        hyperswitch_router: "v1.119.0",
        control_center: "v1.37.7"
      }
    }
    this.config = config;
  }
  getConfig() {
    return this.config;
  }
}
