// Copyright 2017-2023 @polkadot/apps authors & contributors
// SPDX-License-Identifier: Apache-2.0

// from https://github.com/xx-labs/web-wallet/blob/fcdcd4f5ddeeb69c272e4550fde3353ecd0328b7/packages/custom-derives/src/index.ts

import type { DeriveCustom } from "@polkadot/types/types";

import * as stakingOriginal from "@polkadot/api-derive/staking";

import * as stakingOverride from "./staking/index.js";

const derive: DeriveCustom = {
  staking: {
    ...stakingOriginal,
    ...stakingOverride,
  },
};

export default derive;
