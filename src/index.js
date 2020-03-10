/*
 * Copyright 2018 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
const { fetch } = require('@adobe/helix-fetch');
const { wrap: status } = require('@adobe/helix-status');
const { wrap } = require('@adobe/openwhisk-action-utils');
const { logger } = require('@adobe/openwhisk-action-logger');
const { epsagon } = require('@adobe/helix-epsagon');
const querystring = require('querystring');
const range = require('range_check');
const { embed } = require('./embed.js');

const ipList = fetch('https://api.fastly.com/public-ip-list')
  .then((data) => data.json());

async function isWithinRange(forwardedFor, fastlyPublicIps, whitelistedIps = '') {
  /* eslint-disable camelcase */
  const { addresses, ipv6_addresses } = fastlyPublicIps;

  const whitelistedRanges = whitelistedIps
    .split(',')
    .map((ip) => ip.trim())
    .filter((ip) => range.isIP(ip) || range.isRange(ip));

  const ranges = [...addresses, ...ipv6_addresses, whitelistedRanges];
  const forwarded = forwardedFor
    .split(',')
    .map((ip) => ip.trim())
    .filter((ip) => range.isIP(ip));
  /* eslint-enable camelcase */

  return forwarded.some((ip) => ranges
    .some((myranges) => (range.isRange ? range.inRange(ip, myranges) : range === ip)));
}

async function serviceembed(params, url, log) {
  const queryParams = querystring.parse(params.__ow_query);
  const qs = Object.keys(params).reduce((pv, cv) => {
    if (/^__ow_/.test(cv) || /^[A-Z]+_[A-Z]+/.test(cv) || cv === 'api') {
      return pv;
    }
    const retval = { ...pv };
    retval[cv] = params[cv];
    return retval;
  }, {});
  // add the URL
  qs.url = url;
  const api = new URL(params.api || params.OEMBED_RESOLVER_URI);
  if (params.OEMBED_RESOLVER_PARAM && params.OEMBED_RESOLVER_KEY
  && await isWithinRange(params.__ow_headers['x-forwarded-for'], await ipList, params.WHITELISTED_IPS)) {
    qs[params.OEMBED_RESOLVER_PARAM] = params.OEMBED_RESOLVER_KEY;
    Object.entries(qs).forEach(([k, v]) => {
      if (!(k in queryParams)) {
        api.searchParams.append(k, v);
      }
    });
    log.info(`Using embedding service ${params.api || params.OEMBED_RESOLVER_URI} for URL ${url}`);
  }

  return fetch(api.href)
    .then((data) => {
      if (!data.ok) {
        throw new Error(`Status ${data.status}: ${data.statusText || 'request failed, check your url'}`);
      } else {
        return data.json();
      }
    })
    .then((json) => (
      {
        headers: {
          'X-Provider': params.OEMBED_RESOLVER_URI,
          'X-Client-IP': params.__ow_headers['x-forwarded-for'],
          'Content-Type': 'text/html',
          'Cache-Control': `max-age=${json.cache_age ? json.cache_age : '3600'}`,
        },
        body: `<div class="embed embed-oembed embed-advanced">${json.html}</div>`,
      })).catch((error) => {
      log.error(error.message);
      // falling back to normal
      return embed(url);
    });
}


/* eslint-disable no-underscore-dangle, no-console, no-param-reassign */
async function run(params) {
  const { __ow_logger: log = console } = params;

  if (!params.__ow_query) {
    // reconstruct __ow_query
    const query = Object.keys(params)
      .filter((key) => !/^[A-Z]+_[A-Z]+/.test(key))
      .filter((key) => key !== 'api')
      .filter((key) => !/^__ow_/.test(key))
      .reduce((pv, cv) => {
        if (pv) {
          return `${pv}&${cv}=${params[cv]}`;
        }
        return `${cv}=${params[cv]}`;
      }, '');
    params.__ow_query = query;
  }
  const url = `${params.__ow_path.substring(1)}?${params.__ow_query || ''}`;

  const result = await embed(url, params);

  if ((params.api || params.OEMBED_RESOLVER_URI) && result.headers['X-Provider'] !== 'Helix') {
    // filter all __ow_something parameters out
    // and all parameters in all caps
    return serviceembed(params, url, log);
  }
  return result;
}

/**
 * Main function called by the openwhisk invoker.
 * @param params Action params
 * @returns {Promise<*>} The response
 */
module.exports.main = wrap(run)
  .with(epsagon)
  .with(status)
  .with(logger.trace)
  .with(logger);
