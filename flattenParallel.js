const xs = require('xstream').default;

const compare = (a, b) => {
  if (a > b) return +1;
  if (a < b) return -1;
  return 0;
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
          if (active > n) {
            return;
          }
          if (pending.length === 0) {
            return;
          }

          const entry = pending.shift();

          if (!entry) {
            return continue_queue();
          }

          const { progress, status, key, priority } = entry;
          // console.log('priority:', priority);

          if (progress !== 'waiting') {
            // Already running or already done
            return continue_queue();
          }

          const action_map = {
            mounted: entry.type.create,
            updated: entry.type.update,
            unmounted: entry.type.destroy,
          };
          const action = action_map[status];

          if (!action) {
            return continue_queue();
          }

          mounted.get(key).progress = 'working';
          active = active + 1;
          if (debug) console.log("START TASK", active)
          action(entry.props).addListener({
            next: item => {
              // TODO Check if status and progress are still the same
              if (debug) console.log('TASK EMIT')
              listeners.next(item);
            },
            err: err => {
              console.log('err:', err)
            },
            complete: () => {
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
          err: (err) => {
            console.log('err:', err)
          },
          next: (elements) => {
            let removed = new Map(mounted);
            let changed = new Map();
            let added = new Map();

            elements.forEach(next_el => {
              const key = next_el.key;
              const prev_el = mounted.get(key);

              if (prev_el && prev_el.type === next_el.type) {
                // TODO if props haven't changed, the total thing hasn't
                removed.delete(key);
                changed.set(key, next_el);
                return;
              } else {
                added.set(key, next_el);
                return;
              }
            });

            for (let deleted_entry of removed.values()) {
              // console.log('removing:', key);
              const current_entry = mounted.get(deleted_entry.key);
              // If it hasn't even mounted yet, kill totally
              if (current_entry.status === 'waiting' && current_entry.progress === 'mounted') {
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
              // TODO Check if props differ
              // TODO Queue optional update job
              // TODO But only if it has already mounted
              mounted.set(updated_entry.key, Object.assign({}, current_entry, {
                priority: updated_entry.priority,
              }));
            }

            for (let added_entry of added.values()) {
              // console.log('adding:', key)
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
        console.log("STOPPED");
        pending = [];
      }
    });
  };
}
