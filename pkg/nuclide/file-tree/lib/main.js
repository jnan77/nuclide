'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type {Disposable} from 'atom';
import type {FileTreeControllerState} from './FileTreeController';
import type FileTreeControllerType from './FileTreeController';

import {CompositeDisposable} from 'atom';

import featureConfig from '../../feature-config';

/**
 * Minimum interval (in ms) between onChangeActivePaneItem events before revealing the active pane
 * item in the file tree.
 */
const ACTIVE_PANE_DEBOUNCE_INTERVAL_MS = 150;

class Activation {
  _fileTreeController: ?FileTreeControllerType;
  _packageState: ?FileTreeControllerState;
  _subscriptions: CompositeDisposable;
  _paneItemSubscription: ?Disposable;

  constructor(state: ?FileTreeControllerState) {
    this._packageState = state;
    this._subscriptions = new CompositeDisposable();

    const FileTreeController = require('./FileTreeController');
    this._fileTreeController = new FileTreeController(this._packageState);

    const revealSetting = 'nuclide-file-tree.revealFileOnSwitch';
    // Flow does not know that this setting is a boolean, thus the cast.
    this._setRevealOnFileSwitch(((featureConfig.get(revealSetting): any): boolean));

    const ignoredNamesSetting = 'core.ignoredNames';
    this._setIgnoredNames(((atom.config.get(ignoredNamesSetting): any): string | Array<string>));

    const hideIgnoredNamesSetting = 'nuclide-file-tree.hideIgnoredNames';
    this._setRevealOnFileSwitch(((featureConfig.get(hideIgnoredNamesSetting): any): boolean));

    const excludeVcsIgnoredPathsSetting = 'core.excludeVcsIgnoredPaths';
    this._setExcludeVcsIgnoredPaths(
      ((atom.config.get(excludeVcsIgnoredPathsSetting): any): boolean)
    );

    const usePreviewTabs = 'tabs.usePreviewTabs';
    this._setUsePreviewTabs(((atom.config.get(usePreviewTabs): any): ?boolean));

    this._subscriptions.add(
      featureConfig.observe(revealSetting, this._setRevealOnFileSwitch.bind(this)),
      atom.config.observe(ignoredNamesSetting, this._setIgnoredNames.bind(this)),
      featureConfig.observe(hideIgnoredNamesSetting, this._setHideIgnoredNames.bind(this)),
      atom.config.observe(
        excludeVcsIgnoredPathsSetting,
        this._setExcludeVcsIgnoredPaths.bind(this),
      ),
      atom.config.observe(usePreviewTabs, this._setUsePreviewTabs.bind(this)),
    );

  }

  dispose() {
    this._deactivate();
    this._subscriptions.dispose();
  }

  serialize(): ?FileTreeControllerState {
    if (this._fileTreeController) {
      return this._fileTreeController.serialize();
    }
  }

  _setExcludeVcsIgnoredPaths(excludeVcsIgnoredPaths: boolean): void {
    if (!this._fileTreeController) {
      return;
    }
    this._fileTreeController.setExcludeVcsIgnoredPaths(excludeVcsIgnoredPaths);
  }

  _setHideIgnoredNames(hideIgnoredNames: boolean): void {
    if (!this._fileTreeController) {
      return;
    }
    this._fileTreeController.setHideIgnoredNames(hideIgnoredNames);
  }

  _setIgnoredNames(ignoredNames: string|Array<string>) {
    if (!this._fileTreeController) {
      return;
    }
    let normalizedIgnoredNames;
    if (ignoredNames === '') {
      normalizedIgnoredNames = [];
    } else if (typeof ignoredNames === 'string') {
      normalizedIgnoredNames = [ignoredNames];
    } else {
      normalizedIgnoredNames = ignoredNames;
    }
    this._fileTreeController.setIgnoredNames(normalizedIgnoredNames);
  }

  _setRevealOnFileSwitch(shouldReveal: boolean) {
    const {onWorkspaceDidStopChangingActivePaneItem} =
      require('../../atom-helpers').atomEventDebounce;

    if (shouldReveal) {
      const reveal = () => {
        if (this._fileTreeController) {
          this._fileTreeController.revealActiveFile(/* showIfHidden */ false);
        }
      };
      // Guard against this getting called multiple times
      if (!this._paneItemSubscription) {
        // Debounce tab change events to limit unneeded scrolling when changing or closing tabs
        // in quick succession.
        this._paneItemSubscription = onWorkspaceDidStopChangingActivePaneItem(
          reveal,
          ACTIVE_PANE_DEBOUNCE_INTERVAL_MS
        );
        this._subscriptions.add(this._paneItemSubscription);
      }
    } else {
      // Use a local so Flow can refine the type.
      const paneItemSubscription = this._paneItemSubscription;
      if (paneItemSubscription) {
        this._subscriptions.remove(paneItemSubscription);
        paneItemSubscription.dispose();
        this._paneItemSubscription = null;
      }
    }
  }

  _setUsePreviewTabs(usePreviewTabs: ?boolean): void {
    // config is void during startup, signifying no config yet
    if (usePreviewTabs == null || !this._fileTreeController) {
      return;
    }
    this._fileTreeController.setUsePreviewTabs(usePreviewTabs);
  }

  _deactivate() {
    // Guard against deactivate being called twice
    if (this._fileTreeController) {
      this._fileTreeController.destroy();
      this._fileTreeController = null;
    }
  }
}

let activation: ?Activation;

module.exports = {
  activate(state: ?FileTreeControllerState): void {
    // We need to check if the package is already disabled, otherwise Atom will add it to the
    // 'core.disabledPackages' config multiple times.
    if (!atom.packages.isPackageDisabled('tree-view')) {
      atom.packages.disablePackage('tree-view');
    }

    // Unload 'tree-view' to free its resources that are not needed.
    if (atom.packages.isPackageLoaded('tree-view')) {
      atom.packages.unloadPackage('tree-view');
    }

    if (!activation) {
      activation = new Activation(state);
    }
  },

  deactivate() {
    if (activation) {
      activation.dispose();
      activation = null;
    }
  },

  serialize(): ?FileTreeControllerState {
    if (activation) {
      return activation.serialize();
    }
  },
};