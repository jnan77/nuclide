'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import {observeProcess, safeSpawn} from '../../commons-node/process';
import memoize from 'lodash.memoize';
import {Observable} from 'rxjs';

export type Device = {
  name: string;
  udid: string;
  state: string;
  os: string;
};

const DeviceState = {
  Creating: 'Creating',
  Booting: 'Booting',
  ShuttingDown: 'Shutting Down',
  Shutdown: 'Shutdown',
  Booted: 'Booted',
};

export function parseDevicesFromSimctlOutput(output: string): Device[] {
  const devices = [];
  let currentOS = null;

  output.split('\n').forEach(line => {
    const section = line.match(/^-- (.+) --$/);
    if (section) {
      const header = section[1].match(/^iOS (.+)$/);
      if (header) {
        currentOS = header[1];
      } else {
        currentOS = null;
      }
      return;
    }

    const device =
      line.match(/^[ ]*([^()]+) \(([^()]+)\) \((Creating|Booting|Shutting Down|Shutdown|Booted)\)/);
    if (device && currentOS) {
      const [, name, udid, state] = device;
      devices.push({name, udid, state, os: currentOS});
    }
  });

  return devices;
}

export const getDevices = memoize(() => (
  observeProcess(() => safeSpawn('xcrun', ['simctl', 'list', 'devices']))
    .map(event => {
      // Throw errors.
      if (event.kind === 'error') {
        const error = new Error();
        error.name = 'XcrunError';
        throw error;
      }
      return event;
    })
    .reduce(
      (acc, event) => (event.kind === 'stdout' ? acc + event.data : acc),
      '',
    )
    .map(parseDevicesFromSimctlOutput)
    .catch(error => (
      // Users may not have xcrun installed, particularly if they are using Buck for non-iOS
      // projects. If the command failed, just return an empty list.
      error.name === 'XcrunError' ? Observable.of([]) : Observable.throw(error)
    ))
    .share()
));

export function getActiveDeviceIndex(devices: Device[]): number {
  const bootedDeviceIndex = devices.findIndex(
    device => device.state === DeviceState.Booted
  );
  if (bootedDeviceIndex > -1) {
    return bootedDeviceIndex;
  }

  let defaultDeviceIndex = 0;
  let lastOS = '';
  devices.forEach((device, index) => {
    if (device.name === 'iPhone 5s') {
      if (device.os > lastOS) {
        defaultDeviceIndex = index;
        lastOS = device.os;
      }
    }
  });
  return defaultDeviceIndex;
}
