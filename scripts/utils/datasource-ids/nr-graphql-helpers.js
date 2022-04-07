'use strict';
const fetch = require('node-fetch');
const { Policy } = require('cockatiel');

const NR_API_URL = process.env.NR_API_URL;
const NR_API_TOKEN = process.env.NR_API_TOKEN;

/**
 * Build body param for NR GraphQL request
 * @param {{queryString, variables}} queryBody - query string and corresponding variables for request
 * @returns {String} returns the body for the request as string
 */
const buildRequestBody = ({ queryString, variables }) =>
  JSON.stringify({
    ...(queryString && { query: queryString }),
    ...(variables && { variables }),
  });

/**
 * Send NR GraphQL request
 * @param {{queryString, variables}} queryBody - query string and corresponding variables for request
 * @returns {Object} An object with the results or errors of a GraphQL request
 */
const fetchNRGraphqlResults = async (queryBody) => {
  let results;
  let graphqlErrors = [];

  // To help us ensure that the request hits and is processed by nerdgraph
  // This will try the request 3 times, waiting a little longer between each attempt
  // It will retry on status codes 400+, 2** would be success and we wouldn't want to retry for a 3**
  const retry = Policy.handleWhenResult((response) => response.status >= 400)
    .retry()
    .attempts(3)
    .exponential();

  try {
    const body = buildRequestBody(queryBody);

    const res = await retry.execute(() =>
      fetch(NR_API_URL, {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': NR_API_TOKEN,
        },
      })
    );

    if (!res.ok) {
      graphqlErrors.push(
        new Error(`Received status code ${res.status} from the API`)
      );
    } else {
      const { data, errors } = await res.json();
      results = data;
      if (errors) {
        graphqlErrors = [...graphqlErrors, ...errors];
      }
    }
  } catch (error) {
    graphqlErrors.push(error);
  }

  return { data: results, errors: graphqlErrors };
};

/**
 * Handle errors from GraphQL request
 * @param {Object[]} errors  - An array of any errors found
 * @param {String} filePath  - The path related to the validation error
 * @param {Object[]}  [installPlanErrors=[]] - Array of install plan errors which are handled differently
 * @returns {void}
 */
const translateMutationErrors = (errors, filePath, installPlanErrors = []) => {
  console.error(
    `\nERROR: The following errors occurred while validating: ${filePath}`
  );
  errors.forEach((error) => {
    if (error.extensions && error.extensions.argumentPath) {
      const errorPrefix = error.extensions.argumentPath.join('/');

      console.error(`- ${errorPrefix}: ${error.message}`);
    } else {
      console.error(`- ${error.message}`);
    }
  });

  if (installPlanErrors.length > 0) {
    console.error(
      `DEBUG: The following are install plan errors that occured while validating: ${filePath} and can be safely ignored.`
    );

    installPlanErrors.forEach((error) => {
      if (error.extensions && error.extensions.argumentPath) {
        const errorPrefix = error.extensions.argumentPath.join('/');

        console.error(`- ${errorPrefix}: ${error.message}`);
      } else {
        console.error(`- ${error.message}`);
      }
    });
  }
};

module.exports = {
  fetchNRGraphqlResults,
  translateMutationErrors,
};
