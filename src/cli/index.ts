#!/usr/bin/env node

import process from "node:process";

import { runCli } from "./run-cli.js";

process.exitCode = await runCli();
