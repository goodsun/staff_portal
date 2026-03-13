#!/bin/bash
cd /home/ec2-user/labo_portal
set -a
source .env
set +a
exec node dist/app.js
