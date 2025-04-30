# Overview

Welcome to the developer guide for the v2 of the FRREDSS app!

Forest Resource and Renewable Energy Decision Support System (FRREDSS) is an Online Application for Decision Support in Siting Woody Biomass to Electricity Facilities in California.

This documentation provides comprehensive installation and usage instructions for all components of the system.

The project contains three main repositories:

- [cecdss](https://github.com/ucdavis/cecdss) - Frontend application
- [cecdss-backend](https://github.com/ucdavis/cecdss-backend) - Backend API server
- [cecdss-dataprep](https://github.com/ucdavis/cecdss-dataprep) - Data preparation tools

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Repository Setup](#repository-setup)
3. [Set up local dB](#set-up-local-db)
   - [Local PostgreSQL Setup](#local-postgresql-setup)
   - [Verifying dB Setup](#verifying-db-setup)
   - [Creating tables and adding data to the db](#creating-tables-and-adding-data-to-the-db)
   - [Troubleshooting](#troubleshooting)
4. [Frontend installation (cecdss)](#frontend-installation-cecdss)
   - [Set up the environment](#1-set-up-the-environment)
   - [Create .env and choose your backend](#2-create-and-choose-your-backend)
   - [Run the app locally](#3-run-the-app-locally)
   - [Other options for advance users](#4-other-options-for-advance-users)
5. [Backend Installation (cecdss-backend)](#backend-installation-cecdss-backend)
   - [Set up the environment](#1-set-up-the-environment-1)
   - [OSRM Setup](#2-osrm-setup)
   - [Config setup](#3-config-setup)
   - [Running the backend](#4-running-the-backend)
6. [Dataprep Installation (cec-dataprep)](#dataprep-installation-cec-dataprep)
   - [Set up the environment](#1-set-up-the-environment-2)
   - [Working with raw data](#2-working-with-raw-data)
   - [Working with processed data](#3-working-with-processed-data)
   - [Populate the substations table](#4-populate-the-substations-table)
   - [Populate the treatedClustersInfo table](#5-populate-the-treatedclustersinfo-table)
7. [Contact Us](#contact)

## [Prerequisites](#prerequisites)

Before beginning installation, ensure you have the following installed:

- Node.js 16.x or higher
- Python 3.8 or higher
- PostgreSQL 16 or higher
- Git

## [Repository Setup](#repository-setup)

Create a folder and clone the repositories

```
# Create a project directory
mkdir cecdss-project
cd cecdss-project

# Clone all repositories
git clone https://github.com/ucdavis/cecdss.git
git clone https://github.com/ucdavis/cecdss-backend.git
git clone https://github.com/ucdavis/cec-dataprep.git
```

## [Set up local dB](#set-up-local-db)

In order to use the application on your local, you need to set up a psql database.

_Note: You need to have postgresql 16 or higher installed_

### [Local PostgreSQL Setup](#local-postgresql-setup)

#### 1. Start PostgreSQL service (if not already running)

- On Windows:

     ```bash
     # Check PostgreSQL service status
     net start postgresql-x64-12
     ```

- On Mac:

     ```bash
     brew services start postgresql
     ```

- On Linux:

     ```bash
     sudo service postgresql start
     ```

#### 2. Create a new database

   ```bash
   # Login to psql as postgres user
   psql -U postgres

   # Create database
   CREATE DATABASE cecdss;

   # Connect to the new database
   \c cecdss
```

### [Verifying dB Setup](#verifying-db-setup)

#### 1. Connect to the database

```
psql -U postgres -d cecdss
```

#### 2. List all tables

```
\dt
```

### [Creating tables and adding data to the db](#creating-tables-and-adding-data-to-the-db)

#### You can create tables using two methods

##### 1. Tables only

Run the script _db_tables.sql_ found in the _sql_ folder in the _cec-dataprep_ repo to create tables in the _cecdss_ dB you created in psql. This will NOT add data to it and the processing and adding of data is explained in the later steps.

##### 2. All Data including tables

Download and run the SQL dump file _cecdss_v2_dump.sql_ (around 1.2 Gigs) which can be found [here](https://ucdavis.box.com/s/avjix9opltryjkqpwmdmsvxpecpnc4sy). This will load the entire dB on your local. If you don't get access to this file please contact [_frredss@ucdavis.edu_](mailto:frredss@ucdavis.edu).

### [Troubleshooting](#troubleshooting)

#### 1. If you get permission errors

```
-- Inside psql, grant privileges
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_username;
```

#### 2. If you need to reset the database

```
DROP DATABASE cecdss;
CREATE DATABASE cecdss;
```

## [Frontend installation (cecdss)](#frontend-installation-cecdss)

### [1. Set up the environment](#1-set-up-the-environment)

```
# Open the folder through the terminal
cd cecdss

# Install the dependencies
npm install
```

### [2. Create .env and choose your backend](#2-create-and-choose-your-backend)

In the root of the project (`cecdss`) and not the `src` folder create a `.env` file. Add the below variables to the file.

```
REACT_APP_BACKEND_BASE_API=https://cecdss-backend-v2.azurewebsites.net/
REACT_APP_LOCAL_DEVELOPMENT_MODE=false
```

This web front-end relies on the backend project [https://github.com/ucdavis/cecdss-backend](https://github.com/ucdavis/cecdss-backend) to be running and accessible.  By default the backend is expected to be running at localhost:3000 but this can be changed in [config.ts](https://github.com/ucdavis/cecdss/blob/master/src/components/Shared/config.ts) file. You can point to the production backend by making `REACT_APP_LOCAL_DEVELOPMENT_MODE = false` in the `.env` file.

### [3. Run the app locally](#3-run-the-app-locally)

To run locally on port 3001 (the [backend app](https://github.com/ucdavis/cecdss-backend) will be running on 3000 - discussed below).

`npm run dev`

Application User Guide is [available on our Wiki](https://github.com/ucdavis/cecdss/wiki/CEC-DSS-Web-Application-User's-Guide).

### [4. Other options for advance users](#4-other-options-for-advance-users)

#### a. Test application

Launch the test runner in the interactive watch mode.<br>
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

`npm test`

#### b. Create a build

Build the app for production to the `build` folder.

`npm run build`

It correctly bundles React in production mode and optimizes the build for the best performance. The build is minified and the filenames include the hashes

Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

## [Backend Installation (cecdss-backend)](#backend-installation-cecdss-backend)

### [1. Set up the environment](#1-set-up-the-environment-1)

```
# Open the folder through the terminal
cd cecdss-backend

# Install the dependencies
npm install

# You may have to rebuild if you've a problem with the OSRM bindings
npm rebuild
```

### [2. OSRM Setup](#2-osrm-setup)

Routing information for california must be available to this program.  You can create an OSRM extract yourself by following the guides at the [official OSRM website](http://project-osrm.org/).

Or else, follow the below instructions to create OSRM bindings on your local.

Create a folder called `data` in the project root.

In order to get OSRM data, you need to download the California Open Street Map data and then process it using OSRM.  The OSRM process can happen either in docker or using the nodeJS binding libraries.

#### a. Setup

DOCKER (optional): Get the docker image:

`docker pull osrm/osrm-backend`

NodeJS:

`npm install @project-osrm/osrm`

Next, in the `data` folder grab the California OSM data:

`curl -O https://download.geofabrik.de/north-america/us/california-latest.osm.pbf`

Or just download the CA OSRM data file from [here](https://download.geofabrik.de/north-america/us/california-latest.osm.pbf) and put it in the `data` folder.

Make sure you have enough RAM available to docker if you are going to use it.  I used 16GB. See: <https://docs.docker.com/docker-for-mac/#memory>.

#### b. Profile

OSRM needs a vehicle transportation profile to run.  By default they include examples such as car or bicycle.  We are using a special forestry profile.  Whatever profile you use, pass it in during the first step below.  It needs to be in the correct node_modules directory to run.

We will be using the `forestry.lua` profile for our use. Get the file from [here](https://github.com/ucdavis/cec-dataprep/blob/master/forestry.lua), also found in the `cec-dataprep` repo.

Include this file in the `profiles` folder of the `@project-osrm` package which can be found in the `node_modules` folder - `@project-osrm/osrm/profiles/forestry.lua`

#### c. Process OSM files

NodeJS:

`node_modules/@project-osrm/osrm/lib/binding/osrm-extract data/california-latest.osm.pbf -p node_modules/@project-osrm/osrm/profiles/forestry.lua`

`node_modules/@project-osrm/osrm/lib/binding/osrm-contract data/california-latest`

This operation takes some time and after the OSRM files will be found in the `data` folder.

_Otherwise_, see <https://github.com/Project-OSRM/osrm-backend/blob/master/docs/nodejs/api.md> for more details.  This seems to be the easiest method, but an officially recommended docker method is also provided below.

`docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/california-latest.osm.pbf`

`docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-partition /data/california-latest.osrm`

`docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-customize /data/california-latest.osrm`

This should give you a directory full of `*.osrm.*` files which you can use with the OSRM JS library.

More info about the docker container and OSRM backend info available at: <https://hub.docker.com/r/osrm/osrm-backend>

### [3. Config setup](#3-config-setup)

The following **environmental variables** must be set to connect to the dB.

```
DB_HOST=xyz 
DB_USER=xyz
DB_PASS=xyz
DB_NAME=xyz
DB_PORT=xyz
FE_APP_URL='localhost:3001/pages/model'
```

_Note: The values `xyz` are just placeholders. Use your own local dB connection parameters here._

We recommend you create a file in the project root called `.env` and then specify the configuration variables within that file.

### [4. Running the backend](#4-running-the-backend)

At this point you are ready to run the cecdss-backend.

Type `npm run dev` to launch the app at <https://localhost:3000>.

The front-end companion application at <https://github.com/ucdavis/cecdss> will now be able to connect to the backend and you are ready to start making requests.

<hr>

_Note: The below steps (dataprep) are recommended if you've not installed the data directly as given in option 2 in the [Creating tables and adding data to the db](#creating-tables-and-adding-data-to-the-db) section._

<hr>

## [Dataprep Installation (cec-dataprep)](#dataprep-installation-cec-dataprep)

This repo is used to process the raw data and populate the `cecdss` backend.

### [1. Set up the environment](#1-set-up-the-environment-2)

#### a. Install the dependencies

```
# Open the folder through the terminal
cd cec-dataprep

# Install the dependencies
npm install

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

#### b. Setting up the environment variables

DotEnv is supported, or any other standard method of setting environmental variables will work

Variable | Purpose | Default
--- | --- | ---
PIXEL_FILE | The input raw pixel file | `none`
TREATED_OUT_FILE | Where to create the output file | `none`
OSRM_FILE | Location of the main OSRM file | `./data/california-latest.osrm`
HGT_FILES | Elevation info is automatically downloaded here | `./data`

#### c. Running Locally

Use the below command in the terminal.

```
    npm run build
```

### [2. Working with raw data](#2-working-with-raw-data)

1. Download the data folder from box at the following link: <https://ucdavis.box.com/s/bmyts3ps4e04yxs7uw7jla8bltq4rezp>
2. Place it in the project root and rename it `data`.
3. When running 2025 data, leave the file names as they are. When running 2030 data, change line 25 in index.ts to `./data/complete_GLRBT_2030.csv` instead of `./data/complete_GLRBT_2025.csv`.
4. Running the `index.ts` file will process the above files to create the output - `GLBRT_processed.csv`.
5. If you directly want to work with the _processed_ data then follow section 3 below or you can generate your own as per the above instructions.

_Note: The below steps are to work with the `GLBRt_processed.csv` processed data_

### [3. Working with processed data](#3-working-with-processed-data)

Download the processed data from [here](https://ucdavis.box.com/s/u43zontvc98q1i1rbsf5o5qml01asux9) and place it in the `data` folder if you haven't generated it on your own.

#### a. Split the processed data county-wise

In order to process data and populate the `treatedclusters` table we need to split the `GLBRT_processed` county-wise in order to execute chunk-wise processing.

Run the `split_csv.py` file which takes in 1 argument. The `arg` should be the relative path of the processed data (note: The python environment has to be activated).

```
    # Example command in the terminal to run the split_csv.py file
    cec-dataprep/my_env/bin/python cec-dataprep/split_csv.py cec-dataprep/data/GLRBT_processed.csv
```

This takes some time to run. A new folder `split_files` will be created which has `.csv` in the format `county_name.csv`. For entries with no county name the entries will be added to `No_Country.csv`. There should be 59 files.

#### b. Populate the treatedclusters table

After running the `split_csv.py` file, to populate the `treatedclusters` table, run the `process_uploads.py` file. This will upload the data in the `split_files` folder to the `treatedclusters` table in the dB.

Before running the file make sure to add your local dB connection details to the `connect_to_db()` function.

The `process_uploads.py` file which takes in 1 argument. The `arg` should be the relative path of the `split_files` folder.

```
    # Example command in the terminal to run the process_uploads.py file
    cec-dataprep/my_env/bin/python cec-dataprep/process_uploads.py cec-dataprep/split_csv
```

Two new folders will be created - `upload_completed` and `error_files`. The program will shift the files from `split_csv` to `upload_complete` once it has successfully processed each `county_name.csv` file. If there's an error then the file will be shifted to the `error_files` folder from where you can debug and add that data later on.

With this you've successfully populated the `treatedclusters` table.

### [4. Populate the substations table](#populate-the-substations-table)

Given you are connected to your own local dB, download and run the `substations.sql` dump file found [here](https://ucdavis.box.com/s/ea0c1l7ia32eql333bdw4areu74qu3gv) which will populate your `substations` table.

### [5. Populate the treatedClustersInfo table](#populate-the-treatedclustersinfo-table)

Download the `clusters.zip` file found [here](https://ucdavis.box.com/s/glkhq4mqr90bi6nf9mmyzr3sq3qvgids) and place it in the `data` folder.

In the `shapes.ts` file, make sure to add your local dB connection details to the `upload()` function. Furthermore, check the relative path of the `clusters.zip` in `process`.

Finally, running the file will populate the treatedClustersInfo table.

## [Contact Us](#contact)

For any queries or contributions please contact [frredss@ucdavis.edu](mailto:frredss@ucdavis.edu).
