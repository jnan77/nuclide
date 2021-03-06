'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type {nuclide_debugger$Service} from '../../nuclide-debugger-interfaces/service';

import {DebuggingActivation} from './debugging/DebuggingActivation';
import {PackagerActivation} from './packager/PackagerActivation';
import {ShellActivation} from './shell/ShellActivation';
import {CompositeDisposable} from 'atom';

export class Activation {
  _debuggingActivation: DebuggingActivation;
  _disposables: IDisposable;

  constructor(state: ?Object) {
    this._disposables = new CompositeDisposable(
      this._debuggingActivation = new DebuggingActivation(),
      new PackagerActivation(),
      new ShellActivation(),
    );
  }

  dispose(): void {
    this._disposables.dispose();
  }

  provideNuclideDebugger(): nuclide_debugger$Service {
    return this._debuggingActivation.provideNuclideDebugger();
  }

}
