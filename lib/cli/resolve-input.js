// CLI params parser, to be used before we have deducted what commands and options are supported in given context

'use strict';

const memoizee = require('memoizee');
const parseArgs = require('./parse-args');
const commandsSchema = require('./commands-schema');

const baseArgsSchema = {
  boolean: new Set(['help', 'help-interactive', 'use-local-credentials', 'v', 'version']),
  string: new Set(['app', 'config', 'org', 'stage']),
  alias: new Map([
    ['c', 'config'],
    ['h', 'help'],
  ]),
};

const resolveArgsSchema = (commandOptionsSchema) => {
  const options = { boolean: new Set(), string: new Set(), alias: new Map(), multiple: new Set() };
  for (const [name, optionSchema] of Object.entries(commandOptionsSchema)) {
    switch (optionSchema.type) {
      case 'boolean':
        options.boolean.add(name);
        break;
      case 'multiple':
        options.multiple.add(name);
        break;
      default:
        options.string.add(name);
    }
    if (optionSchema.shortcut) options.alias.set(optionSchema.shortcut, name);
  }
  return options;
};

module.exports = memoizee(() => {
  const args = process.argv.slice(2);

  // Ideally no options should be passed before command (to know what options are supported,
  // and whether they're boolean or not, we need to know command name upfront).
  // Still so far we (kind of) supported such notation and we need to maintain it in current major.
  // Thefore at first resolution stage we use schema that recognizes just some popular options
  let options = parseArgs(args, baseArgsSchema);
  let commands = options._;
  delete options._;

  let command = commands.join(' ');

  if (!command) {
    // Handle eventual special cases, not reflected in commands schema
    if (options.v) options.version = true;
    if (options.help || options.version) return { commands, options, isHelpRequest: true };
  }
  if (command === 'help') return { commands, options, isHelpRequest: true };

  // Having command potentially resolved, resolve options again with help of the command schema
  let commandSchema = commandsSchema.get(command);
  while (commandSchema) {
    const resolvedOptions = parseArgs(args, resolveArgsSchema(commandSchema.options));
    const resolvedCommand = resolvedOptions._.join(' ');
    if (resolvedCommand === command) {
      options = resolvedOptions;
      commands = options._;
      delete options._;
      break;
    }
    // Unlikely scenario, where after applying the command schema different command resolves
    // It can happen only in cases where e.g. for "sls deploy --force  function -f foo"
    // we intially assume "deploy" command, while after applying "deploy" command schema it's
    // actually a "deploy function" command that resolves
    command = resolvedCommand;
    commandSchema = commandsSchema.get(resolvedCommand);
  }

  const argsString = args.join(' ');
  if (command && argsString !== command && !argsString.startsWith(`${command} `)) {
    // Some options were passed before command name (e.g. "sls -v deploy"), deprecate such usage
    require('../utils/logDeprecation')(
      'CLI_OPTIONS_BEFORE_COMMAND',
      '"serverless" command options are expected to follow command and not be put before the command.\n' +
        'Starting from next major Serverless will no longer support the latter form.'
    );
  }

  const result = { commands, options };

  if ((!command && options['help-interactive']) || options.help) result.isHelpRequest = true;
  return result;
});
