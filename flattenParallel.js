const xs = require('xstream').default;
const chalk = require('chalk');

const compare = (a, b) => {
  if (a > b) return +1;
  if (a < b) return -1;
  return 0;
}

class PreconditionError extends Error {}
const precondition = (predicate, message) => {
  if (!predicate) {
    throw new PreconditionError(message);
  }
}

const get_changes_map = ({ keyed_array, old_map }) => {
  let removed = new Map(old_map);
  let changed = new Map();
  let added = new Map();

  keyed_array.forEach(next_el => {
    const key = next_el.key;
    const prev_el = old_map.get(key);

    if (prev_el) {
      precondition(
        prev_el.type === next_el.type,
        `Type of element can not change (key: ${key})`
      );

      // TODO if props haven't changed, the total thing hasn't
      removed.delete(key);
      changed.set(key, next_el);
      return;
    } else {
      added.set(key, next_el);
      return;
    }
  });

  return { removed, changed, added };
}

module.exports = function render_elements(n) {
  return function(input$) {
    /*:flow
    type Progress =
      | 'waiting'
      | 'working'
      | 'done'
    type Status =
      | 'mounted'
      | 'updated'
      | 'unmounted'
    */

    let mounted /*: Map<string, {
      key, props, type, priority,
      progress: Progress,
      status: Status,
    }> */ = new Map();

    //let

    let pending = [];
    let active = 0;

    const debug = false;

    return xs.create({
      start: listeners => {
        const continue_queue = () => {
          if (pending.length === 0 || active > n) {
            return;
          }

          const entry = pending.shift();
          const { progress, status, key, priority } = entry;

          const action_map = {
            mounted: entry.type.create,
            updated: entry.type.update,
            unmounted: entry.type.destroy,
          };
          const action = action_map[status];

          if (!action) {
            return continue_queue();
          }

          if (mounted.get(key).progress !== 'waiting') {
            console.log(chalk.blue(`NOT WAITING`), mounted.get(key));
          }

          mounted.get(key).progress = 'working';
          active = active + 1;

          if (active < n) {
            continue_queue();
          }

          if (debug) console.log("START TASK", active)
          action(entry.props).addListener({
            next: item => {
              // TODO Check if status and progress are still the same
              if (debug) console.log('TASK EMIT')
              listeners.next(item);
            },
            error: listeners.error,
            complete: () => {
              if (entry.status !== status || entry.progress !== 'working') {
                console.warn('WHAT')
                console.warn('entry:', entry);
                console.warn('status, progress:', status, progress);
              }

              active = active - 1;
              // TODO Check if status and progress are still the same
              if (status === 'unmounted') {
                mounted.delete(key);
              } else {
                mounted.get(key).progress = 'done';
              }
              if (debug) console.log('TASK DONE', active);
              setImmediate(() => {
                continue_queue();
              });
            }
          });
        }

        input$.addListener({
          complete: listeners.complete,
          error: listeners.error,
          next: (elements) => {
            // `removed` is a map of all values that got removed,
            // `changed` is a map of all values that got changed and
            // `added`... you guessed it
            // console.log('elements:', elements)

            const { removed, changed, added } = get_changes_map({
              keyed_array: elements,
              old_map: mounted,
            });

            // const _removed = [...removed.values()].map(entry => {
            //   return {
            //     key: entry.key,
            //     type: 'removed',
            //     next: null,
            //     prev: entry,
            //   }
            // });
            //
            // const _changed = [...changed.values()].map(entry => {
            //   return {
            //     key: entry.key,
            //     type: 'changed',
            //     next: entry,
            //     prev: mounted.get(entry.key),
            //   }
            // });
            //
            // const _added = [...added.values()].map(entry => {
            //   return {
            //     key: entry.key,
            //     type: 'added',
            //     next: entry,
            //     prev: null,
            //   }
            // });
            // const changes = [..._removed, ..._changed, ..._added];

            // console.log('removed, changed, added:', removed, changed, added)

            for (let deleted_entry of removed.values()) {
              // console.log('removing:', key);
              const current_entry = mounted.get(deleted_entry.key);
              // If it hasn't even mounted yet, kill totally
              if (current_entry.progress === 'waiting' && current_entry.status === 'mounted') {
                mounted.delete(deleted_entry.key);
              } else {
                mounted.set(deleted_entry.key, Object.assign({}, deleted_entry, {
                  progress: 'waiting',
                  status: 'unmounted',
                  priority: 100,
                }));
              }
            }

            // Update? TODO
            for (let updated_entry of changed.values()) {
              // console.log('updating:', key);

              // For now I just update the priority
              const current_entry = mounted.get(updated_entry.key);
              // In good react fashion, I want this already...
              // TODO Make sure this doesn't let bugs sneak in
              const should_update =
                updated_entry.type.should_component_update || (() => true);

              if (current_entry.progress === 'done') {
                // It is "done" with whatever it was doing, but it is still here
                // so it has either 1. mounted 2. updated
                // ... in both of these cases we want to reschedule an update
                if (should_update(current_entry, updated_entry)) {
                  mounted.set(updated_entry.key, Object.assign({}, updated_entry, {
                    status: 'updated',
                    progress: 'waiting',
                  }));
                }
              } else if (current_entry.progress === 'working') {
                // TODO Cancel current job? Directly reschedule new one?
                if (should_update(current_entry, updated_entry)) {
                  console.log(chalk.blue('No idea how this would work'));
                }
              } else if (current_entry.progress === 'waiting') {
                // In the case it is waiting, we want to replace it but keep its status.
                // TODO If it is waiting for unmount then priority will be fucked up?
                // (because right now unmounts have a priority of 100 (high))
                mounted.set(updated_entry.key, Object.assign({}, updated_entry, {
                  progress: current_entry.progress,
                  status: current_entry.status,
                }));
              } else {
                throw new Error(`What is going on '${current_entry.progress}'`);
              }
            }

            for (let added_entry of added.values()) {
              // console.log('adding:', key);
              mounted.set(added_entry.key, Object.assign({}, added_entry, {
                progress: 'waiting',
                status: 'mounted',
              }));
            }

            // Reset pending and fill it from mounted
            pending = []
            for(let entry of mounted.values()) {
              if (entry.progress === 'waiting') {
                pending.push(entry);
              }
            }

            // Sort pending so higher priority comes first
            pending.sort((a, b) => compare(a.priority, b.priority));

            continue_queue();
          },
        });
      },

      stop: () => {
        console.log(chalk.red(`STOPPED parallel render!`));
        pending = [];
      }
    });
  };
}
