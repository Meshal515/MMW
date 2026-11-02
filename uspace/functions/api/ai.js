import worker from '../../worker/index.js';

export async function onRequest({request, env}) {
  return worker.fetch(request, env);
}
