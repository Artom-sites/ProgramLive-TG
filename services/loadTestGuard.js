function validateLoadTestEnvironment() {
  if (process.env.LOAD_TEST_MODE !== 'true') return;

  if (process.env.K_SERVICE === 'programlive') {
    console.error("FATAL: LOAD_TEST_MODE is true but K_SERVICE is production. Aborting.");
    process.exit(1);
  }

  if (!process.env.LOAD_TEST_SECRET) {
    console.error("FATAL: LOAD_TEST_SECRET is missing. Aborting.");
    process.exit(1);
  }

  if (process.env.LOAD_TEST_ENV === 'local') {
    if (process.env.NODE_ENV === 'production' || process.env.K_SERVICE) {
      console.error("FATAL: Invalid local load test environment.");
      process.exit(1);
    }
  } else if (process.env.LOAD_TEST_ENV === 'staging') {
    if (process.env.K_SERVICE !== 'programlive-staging') {
      console.error("FATAL: Invalid staging load test environment.");
      process.exit(1);
    }
  } else {
    console.error("FATAL: LOAD_TEST_ENV must be 'local' or 'staging'.");
    process.exit(1);
  }
}

module.exports = { validateLoadTestEnvironment };
