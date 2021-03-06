'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type {Action, AppState, BuildSystem, Task} from './types';

import once from '../../commons-node/once';
import {observableFromSubscribeFunction} from '../../commons-node/event';
import {compact} from '../../commons-node/stream';
import * as ActionTypes from './ActionTypes';
import {getActiveBuildSystem} from './getActiveBuildSystem';
import {Observable} from 'rxjs';
import invariant from 'assert';

const HANDLED_ACTION_TYPES = [
  ActionTypes.RUN_TASK,
  ActionTypes.STOP_TASK,
  ActionTypes.REFRESH_TASKS,
];

export function applyActionMiddleware(
  actions: Observable<Action>,
  getState: () => AppState,
): Observable<Action> {

  const output = Observable.merge(

    // Forward on the actions that we don't handle here.
    actions.filter(action => HANDLED_ACTION_TYPES.indexOf(action.type) === -1),

    compact(
      actions.filter(action => action.type === ActionTypes.STOP_TASK)
        .map(action => {
          const {taskStatus} = getState();
          return taskStatus == null ? null : taskStatus.info;
        })
    )
      .do(taskInfo => { taskInfo.cancel(); })
      .map(taskInfo => ({
        type: ActionTypes.TASK_STOPPED,
        payload: {taskInfo},
      })),

    // Update the tasks...
    actions
      // ...when the toolbar becomes visible
      .filter(
        action => action.type === ActionTypes.TOOLBAR_VISIBILITY_UPDATED && action.payload.visible
      )
      .merge(
        // ...or when it's already visible and we hear a REFRESH_TASKS action.
        actions.filter(action => action.type === ActionTypes.REFRESH_TASKS && getState().visible),
      )
      .map(action => getActiveBuildSystem(getState()))
      .distinctUntilChanged()
      .switchMap(activeBuildSystem => {
        const tasksToActions = tasks => ({
          type: ActionTypes.TASKS_UPDATED,
          payload: {tasks},
        });
        const noTasks = Observable.of(tasksToActions([]));
        return activeBuildSystem == null
          ? noTasks
          : noTasks.concat(
              observableFromSubscribeFunction(
                activeBuildSystem.observeTasks.bind(activeBuildSystem)
              )
              .map(tasksToActions)
            );
      }),

    // Dispatch the run action to the selected build system and collect the results.
    actions.filter(action => action.type === ActionTypes.RUN_TASK)
      .switchMap(action => {
        invariant(action.type === ActionTypes.RUN_TASK);
        const activeBuildSystem = getActiveBuildSystem(getState());
        const {taskType} = action.payload;

        if (activeBuildSystem == null) {
          throw new Error('No build system is selected');
        }

        const task = getState().tasks.find(t => t.type === taskType);
        invariant(task != null);

        if (!task.enabled) {
          return Observable.empty();
        }

        return runTask(activeBuildSystem, task, getState)
          // Stop listening once the task is done.
          .takeUntil(output.filter(a => (
            a.type === ActionTypes.TASK_COMPLETED
            || a.type === ActionTypes.TASK_ERRORED
            || a.type === ActionTypes.TASK_STOPPED
          )));
      }
    ),

  )
    .share();

  return output;
}

/**
 * Run a task and transform its output into domain-specific actions.
 */
function runTask(
  buildSystem: BuildSystem,
  task: Task,
  getState: () => AppState,
): Observable<Action> {
  // $FlowFixMe(matthewwithanm): Type this.
  return Observable.using(
    () => {
      let taskInfo = buildSystem.runTask(task.type);
      // We may call cancel multiple times so let's make sure it's idempotent.
      taskInfo = {...taskInfo, cancel: once(taskInfo.cancel)};
      return {
        taskInfo,
        unsubscribe() { taskInfo.cancel(); },
      };
    },
    ({taskInfo}) => Observable.of(taskInfo),
  )
    .switchMap(taskInfo => {
      const progressStream = taskInfo.observeProgress == null
        ? Observable.empty()
        : observableFromSubscribeFunction(
            taskInfo.observeProgress.bind(taskInfo),
          );

      return Observable
        .of({
          type: ActionTypes.TASK_STARTED,
          payload: {taskInfo},
        })
        .concat(
          progressStream.map(progress => ({
            type: ActionTypes.TASK_PROGRESS,
            payload: {progress},
          }))
        )
        .merge(
          observableFromSubscribeFunction(taskInfo.onDidError.bind(taskInfo))
            .map(err => { throw err; })
        )
        .takeUntil(
          observableFromSubscribeFunction(taskInfo.onDidComplete.bind(taskInfo))
        )
        .concat(Observable.of({
          type: ActionTypes.TASK_COMPLETED,
          payload: {taskInfo},
        }));
    })
    .catch(error => {
      atom.notifications.addError(
        `The task "${task.label}" failed`,
        {description: error.message},
      );
      const {taskStatus} = getState();
      return Observable.of({
        type: ActionTypes.TASK_ERRORED,
        payload: {
          error,
          taskInfo: taskStatus == null ? null : taskStatus.info,
        },
      });
    })
    .share();
}
