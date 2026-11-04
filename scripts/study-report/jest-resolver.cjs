const path = require('node:path');

// Only the standalone source has explicit emitted-JS extensions for portable ESM.
module.exports = (request, options) => {
  const source = path.join('src', 'standalone', 'studyReport');
  const selected =
    options.basedir.endsWith(source) &&
    /^\.\/(?:browser|styles|viewModel|render|content|methodContent|documentLanguage)\.js$/u.test(
      request,
    )
      ? request.slice(0, -3)
      : request;
  return options.defaultResolver(selected, options);
};
