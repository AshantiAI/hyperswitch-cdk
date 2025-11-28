Content-Type: multipart/mixed; boundary="//"
MIME-Version: 1.0

--//
Content-Type: text/cloud-config; charset="us-ascii"
MIME-Version: 1.0

#cloud-config
package_update: true
package_upgrade: true

packages:
  - docker
  - amazon-cloudwatch-agent

runcmd:
  - systemctl enable amazon-ssm-agent
  - systemctl start amazon-ssm-agent
  - systemctl enable docker
  - systemctl start docker
  - usermod -a -G docker ec2-user

--//
Content-Type: text/x-shellscript-per-boot; charset="us-ascii"
MIME-Version: 1.0

#!/bin/bash
exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1

# Configuration Variables (replaced by CDK)

# Ensure services are running on every boot
systemctl start amazon-ssm-agent
systemctl start docker

# Create CloudWatch Agent configuration (idempotent)
cat << 'CWEOF' > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/user-data.log",
            "log_group_name": "/aws/ec2/hyperswitch/user-data",
            "log_stream_name": "{instance_id}",
            "timezone": "UTC"
          },
          {
            "file_path": "/var/log/messages",
            "log_group_name": "/aws/ec2/hyperswitch/messages",
            "log_stream_name": "{instance_id}",
            "timezone": "UTC"
          }
        ]
      }
    }
  }
}
CWEOF

# Start CloudWatch Agent
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config \
  -m ec2 \
  -s \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json

# Create hyperswitch config directory with proper permissions
mkdir -p /opt/hyperswitch
chmod 755 /opt/hyperswitch

# Download config.toml from S3 (always refresh on boot)
aws s3 cp {{config_toml_s3_url}} /opt/hyperswitch/config.toml
chmod 644 /opt/hyperswitch/config.toml

# Retrieve database password from Secrets Manager
DB_SECRET=$(aws secretsmanager get-secret-value --region {{aws_region}} --secret-id {{db_secret_arn}} --query 'SecretString' --output text)
DB_PASSWORD=$(echo $DB_SECRET | jq -r '.password')

# Create .env with runtime configuration
cat << EOF > /opt/hyperswitch/.env
# for hyperswitch router
ROUTER__SERVER__HOST=0.0.0.0
ROUTER__SERVER__BASE_URL=https://{{app_cloudfront_url}}
ROUTER__REDIS__HOST={{redis_host}}
ROUTER__MASTER_DATABASE__HOST={{db_host}}
ROUTER__MASTER_DATABASE__USERNAME={{db_username}}
ROUTER__MASTER_DATABASE__PASSWORD=$DB_PASSWORD
ROUTER__MASTER_DATABASE__DBNAME={{db_name}}
# ROUTER__REPLICA_DATABASE__HOST={{db_host}}
# ROUTER__REPLICA_DATABASE__USERNAME={{db_username}}
# ROUTER__REPLICA_DATABASE__PASSWORD=$DB_PASSWORD
# ROUTER__REPLICA_DATABASE__DBNAME={{db_name}}
ROUTER__SECRETS__ADMIN_API_KEY={{admin_api_key}}
ROUTER__SECRETS__JWT_SECRET={{jwt_secret}}
ROUTER__SECRETS__MASTER_ENC_KEY={{master_enc_key}}
ROUTER__CORS__ORIGINS=https://{{app_cloudfront_url}},https://{{sdk_cloudfront_url}},https://{{control_center_cloudfront_url}}

# for hyperswitch control center
default__endpoints__api_url=https://{{app_cloudfront_url}}
default__endpoints__sdk_url=https://{{sdk_cloudfront_url}}/{{version}}/{{sub_version}}/HyperLoader.js
default__features__totp=false
default__features__force_cookies=true
default__features__test_live_toggle=false
default__features__is_live_mode=true
EOF
chmod 644 /opt/hyperswitch/.env

# Stop and remove existing containers (if any) to ensure clean state on reboot
docker stop hyperswitch-router hyperswitch-control-center 2>/dev/null || true
docker rm hyperswitch-router hyperswitch-control-center 2>/dev/null || true

# Pull latest images (only downloads if updated)
docker pull juspaydotin/hyperswitch-router:{{hyperswitch_version}}-standalone
docker pull juspaydotin/hyperswitch-control-center:{{control_center_version}}

# Start application containers (migrations are handled by Lambda before deployment)
echo "Starting application containers..."
docker run -d --name hyperswitch-router \
  --restart=always \
  --network host \
  --env-file /opt/hyperswitch/.env \
  -v /opt/hyperswitch/:/local/config \
  juspaydotin/hyperswitch-router:{{hyperswitch_version}}-standalone \
  ./router -f /local/config/config.toml

docker run -d --name hyperswitch-control-center \
  --restart=always \
  --network host \
  --env-file /opt/hyperswitch/.env \
  juspaydotin/hyperswitch-control-center:{{control_center_version}}

--//--
