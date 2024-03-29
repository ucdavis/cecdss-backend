# CEC Dataprep

This program is the backend API that integrates all of the data processed in [CEC-DATAPREP](https://github.com/ucdavis/cec-dataprep/) with [FRCS](https://github.com/ucdavis/fuel-reduction-cost-simulator), [TEA](https://github.com/ucdavis/technoeconomic-assessment/) and [LCA](https://github.com/ucdavis/lca) models.

The API can be called directly, but more commonly is used for the backend to the [CECDSS Web Application](https://github.com/ucdavis/cecdss).

# Running locally

## Setup

### Node setup

1. Make sure you are using node v14
1. `npm install` the dependencies. (You may have to `npm rebuild` if you are having problems with osrm bindings)

### Config setup

The following **environmental variables** must be set:

DB_HOST=xyz
DB_USER=xyz
DB_PASS=xyz
DB_NAME=xyz
DB_PORT=xyz

We recommend you create a file in the project root called `.env` and then specify the configuration variables within that file.

### OSRM Setup

Routing information for california must be available to this program.  You can create an OSRM extract yourself by following the guides at the [official OSRM website](http://project-osrm.org/).  We also provide a custom OSRM extract which is available at (TBD - coming soon).

Create a folder called `data` in the project root and extract the OSRM files within it.

### Setup complete

At this point you are ready to run the cecdss-backend

## Running the Backend

Type `npm run dev` to launch the app at https://localhost:3000.

The front-end companion application at https://github.com/ucdavis/cecdss will now be able to connect to the backend and you are ready to start making requests.

*TODO* API Documentation
