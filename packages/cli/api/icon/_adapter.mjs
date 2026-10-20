// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The `icon` subject's adapter: its only access to the environment.
 * Loads the project and reads its icon sets through the `Project` seam.
 *
 * @position api/icon — adapter for api/icon/{search,detail,list}
 */

import {Project} from '../../foundation/config/project.mjs';

/**
 * The project's installed icon sets, in tie order, with the sets withdrawn
 * and the project's icon-set choice.
 * @param {string} cwd
 */
export async function loadIconSets(cwd) {
  const project = await Project.load(cwd);
  return project.iconSets();
}
