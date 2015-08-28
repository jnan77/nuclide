'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type {AbsolutePath} from '../types/common';
import type {Collection, Node, NodePath} from '../types/ast';

var jscs = require('jscodeshift');

var getDeclaredIdentifiers = require('../utils/getDeclaredIdentifiers');
var getNonDeclarationTypes = require('../utils/getNonDeclarationTypes');
var isGlobal = require('../utils/isGlobal');

type ConfigEntry = {
  searchTerms: [any, Object],
  filters: Array<(path: NodePath) => boolean>,
  getNames: (node: Node) => Array<string>,
};

// These are the things we should try to remove.
var CONFIG: Array<ConfigEntry> = [
  // import type Foo from 'Foo';
  {
    searchTerms: [
      jscs.ImportDeclaration,
      {importKind: 'type'},
    ],
    filters: [isGlobal],
    getNames: node => node.specifiers.map(specifier => specifier.local.name),
  },
];

function removeUnusedTypes(root: Collection, sourcePath: AbsolutePath): void {
  var declared = getDeclaredIdentifiers(root, sourcePath);
  var used = getNonDeclarationTypes(root, sourcePath);
  // Remove things based on the config.
  CONFIG.forEach(config => {
    root
      .find(config.searchTerms[0], config.searchTerms[1])
      .filter(path => config.filters.every(filter => filter(path)))
      .filter(path => config.getNames(path.node).every(
        name => !used.has(name) || declared.has(name)
      ))
      .remove();
  });
}

module.exports = removeUnusedTypes;
