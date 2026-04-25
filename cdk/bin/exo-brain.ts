#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { ExoBrainStack } from "../lib/exo-brain-stack";

const app = new cdk.App();
new ExoBrainStack(app, "ExoBrainStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "ap-northeast-1",
  },
});
