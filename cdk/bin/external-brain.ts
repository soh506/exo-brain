#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { ExternalBrainStack } from "../lib/external-brain-stack";

const app = new cdk.App();
new ExternalBrainStack(app, "ExternalBrainStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "ap-northeast-1",
  },
});
