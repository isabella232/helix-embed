/*
 * Copyright 2019 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
/* eslint-env mocha */
const chai = require('chai');
const chaiHttp = require('chai-http');
const packjson = require('../package.json');


chai.use(chaiHttp);
const { expect } = chai;

function getbaseurl() {
  const namespace = 'helix';
  const package = 'helix-services';
  const name = packjson.name.replace('@adobe/helix-', '');
  let version = `${packjson.version}`;
  if (process.env.CI && process.env.CIRCLE_BUILD_NUM && process.env.CIRCLE_BRANCH !== 'master') {
    version = `ci${process.env.CIRCLE_BUILD_NUM}`;
  }
  return `api/v1/web/${namespace}/${package}/${name}@${version}`;
}

describe('Running Post-Deployment Integration Tests', () => {
  it('Service is reachable', async () => {
    await chai
      .request('https://adobeioruntime.net/')
      .get(getbaseurl() + "/https://www.youtube.com/watch?v=TTCVn4EByfI")
      .then((response) => {
        expect(response).to.have.status(200);
        // eslint-disable-next-line  no-console
        expect(response.text).to.contain('youtube.com');
      }).catch((e) => {
        throw e;
      });
  });

  it('Service reports status', async () => {
    await chai
      .request('https://adobeioruntime.net/')
      .get(getbaseurl() + "")
      .then((response) => {
        expect(response).to.have.status(200);
        expect(response).to.have.header('Content-Type', 'application/xml; charset=UTF-8');
      }).catch((e) => {
        throw e;
      });
  });
});