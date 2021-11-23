import { TelemetryClient } from 'applicationinsights';

// tslint:disable-next-line:no-var-requires
const appInsights = require('applicationinsights');

let appInsightsClient: TelemetryClient;

// need to have the ENV var APPINSIGHTS_INSTRUMENTATIONKEY set already
export const setupAppInsights = () => {
  appInsights
    .setup()
    .setAutoCollectDependencies(true) // include postgres
    .start();
  // if we want to also collect calls to console.log()
  // setAutoCollectConsole(true, true).

  appInsightsClient = appInsights.defaultClient;
};

export const trackMetric = (name: string, value: number) => {
  appInsightsClient.trackMetric({ name, value });
};
