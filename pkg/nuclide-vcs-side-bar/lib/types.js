'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type {BookmarkInfo} from '../../nuclide-hg-repository-base/lib/HgService';

type FetchProjectDirectoriesAction = {
  type: 'fetch-project-repositories';
};

type SetProjectDirectoriesAction = {
  payload: {
    projectDirectories: Array<atom$Directory>;
  };
  type: 'set-project-directories';
};

type UpdateToBookmarkAction = {
  payload: {
    bookmark: BookmarkInfo;
    repository: atom$Repository;
  };
  type: 'update-to-bookmark';
};

export type Action =
  FetchProjectDirectoriesAction
  | SetProjectDirectoriesAction
  | UpdateToBookmarkAction;
