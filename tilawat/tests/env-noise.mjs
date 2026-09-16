/* These are conditions of the machine the test runs on, not of the app: a TLS
   interception proxy, a blocked or missing network. The app reaches third-party
   origins (the YouTube iframe API, archive.org, the catalogue Worker) on every
   load, so behind a corporate proxy or offline the suite fails before it can
   assert anything about behaviour.
   Everything the app itself can cause — a 404, a CORS refusal, a thrown error,
   a missing local file — still fails the run. */
const ENVIRONMENT = /net::ERR_(?:CERT_[A-Z_]+|PROXY_[A-Z_]+|INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|NETWORK_CHANGED|TUNNEL_CONNECTION_FAILED)/;

export const isEnvironmentNoise = text => ENVIRONMENT.test(String(text ?? ''));
export const appErrors = list => list.filter(entry => !isEnvironmentNoise(entry));
