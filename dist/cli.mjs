#!/usr/bin/env node
import { createRequire } from "node:module";
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: __accessProp.bind(mod, key),
        enumerable: true
      });
  if (canCache)
    cache.set(mod, to);
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// node_modules/commander/lib/error.js
var require_error = __commonJS((exports) => {
  class CommanderError extends Error {
    constructor(exitCode, code, message) {
      super(message);
      Error.captureStackTrace(this, this.constructor);
      this.name = this.constructor.name;
      this.code = code;
      this.exitCode = exitCode;
      this.nestedError = undefined;
    }
  }

  class InvalidArgumentError extends CommanderError {
    constructor(message) {
      super(1, "commander.invalidArgument", message);
      Error.captureStackTrace(this, this.constructor);
      this.name = this.constructor.name;
    }
  }
  exports.CommanderError = CommanderError;
  exports.InvalidArgumentError = InvalidArgumentError;
});

// node_modules/commander/lib/argument.js
var require_argument = __commonJS((exports) => {
  var { InvalidArgumentError } = require_error();

  class Argument {
    constructor(name, description) {
      this.description = description || "";
      this.variadic = false;
      this.parseArg = undefined;
      this.defaultValue = undefined;
      this.defaultValueDescription = undefined;
      this.argChoices = undefined;
      switch (name[0]) {
        case "<":
          this.required = true;
          this._name = name.slice(1, -1);
          break;
        case "[":
          this.required = false;
          this._name = name.slice(1, -1);
          break;
        default:
          this.required = true;
          this._name = name;
          break;
      }
      if (this._name.length > 3 && this._name.slice(-3) === "...") {
        this.variadic = true;
        this._name = this._name.slice(0, -3);
      }
    }
    name() {
      return this._name;
    }
    _concatValue(value, previous) {
      if (previous === this.defaultValue || !Array.isArray(previous)) {
        return [value];
      }
      return previous.concat(value);
    }
    default(value, description) {
      this.defaultValue = value;
      this.defaultValueDescription = description;
      return this;
    }
    argParser(fn) {
      this.parseArg = fn;
      return this;
    }
    choices(values) {
      this.argChoices = values.slice();
      this.parseArg = (arg, previous) => {
        if (!this.argChoices.includes(arg)) {
          throw new InvalidArgumentError(`Allowed choices are ${this.argChoices.join(", ")}.`);
        }
        if (this.variadic) {
          return this._concatValue(arg, previous);
        }
        return arg;
      };
      return this;
    }
    argRequired() {
      this.required = true;
      return this;
    }
    argOptional() {
      this.required = false;
      return this;
    }
  }
  function humanReadableArgName(arg) {
    const nameOutput = arg.name() + (arg.variadic === true ? "..." : "");
    return arg.required ? "<" + nameOutput + ">" : "[" + nameOutput + "]";
  }
  exports.Argument = Argument;
  exports.humanReadableArgName = humanReadableArgName;
});

// node_modules/commander/lib/help.js
var require_help = __commonJS((exports) => {
  var { humanReadableArgName } = require_argument();

  class Help {
    constructor() {
      this.helpWidth = undefined;
      this.sortSubcommands = false;
      this.sortOptions = false;
      this.showGlobalOptions = false;
    }
    visibleCommands(cmd) {
      const visibleCommands = cmd.commands.filter((cmd2) => !cmd2._hidden);
      const helpCommand = cmd._getHelpCommand();
      if (helpCommand && !helpCommand._hidden) {
        visibleCommands.push(helpCommand);
      }
      if (this.sortSubcommands) {
        visibleCommands.sort((a, b) => {
          return a.name().localeCompare(b.name());
        });
      }
      return visibleCommands;
    }
    compareOptions(a, b) {
      const getSortKey = (option) => {
        return option.short ? option.short.replace(/^-/, "") : option.long.replace(/^--/, "");
      };
      return getSortKey(a).localeCompare(getSortKey(b));
    }
    visibleOptions(cmd) {
      const visibleOptions = cmd.options.filter((option) => !option.hidden);
      const helpOption = cmd._getHelpOption();
      if (helpOption && !helpOption.hidden) {
        const removeShort = helpOption.short && cmd._findOption(helpOption.short);
        const removeLong = helpOption.long && cmd._findOption(helpOption.long);
        if (!removeShort && !removeLong) {
          visibleOptions.push(helpOption);
        } else if (helpOption.long && !removeLong) {
          visibleOptions.push(cmd.createOption(helpOption.long, helpOption.description));
        } else if (helpOption.short && !removeShort) {
          visibleOptions.push(cmd.createOption(helpOption.short, helpOption.description));
        }
      }
      if (this.sortOptions) {
        visibleOptions.sort(this.compareOptions);
      }
      return visibleOptions;
    }
    visibleGlobalOptions(cmd) {
      if (!this.showGlobalOptions)
        return [];
      const globalOptions = [];
      for (let ancestorCmd = cmd.parent;ancestorCmd; ancestorCmd = ancestorCmd.parent) {
        const visibleOptions = ancestorCmd.options.filter((option) => !option.hidden);
        globalOptions.push(...visibleOptions);
      }
      if (this.sortOptions) {
        globalOptions.sort(this.compareOptions);
      }
      return globalOptions;
    }
    visibleArguments(cmd) {
      if (cmd._argsDescription) {
        cmd.registeredArguments.forEach((argument) => {
          argument.description = argument.description || cmd._argsDescription[argument.name()] || "";
        });
      }
      if (cmd.registeredArguments.find((argument) => argument.description)) {
        return cmd.registeredArguments;
      }
      return [];
    }
    subcommandTerm(cmd) {
      const args = cmd.registeredArguments.map((arg) => humanReadableArgName(arg)).join(" ");
      return cmd._name + (cmd._aliases[0] ? "|" + cmd._aliases[0] : "") + (cmd.options.length ? " [options]" : "") + (args ? " " + args : "");
    }
    optionTerm(option) {
      return option.flags;
    }
    argumentTerm(argument) {
      return argument.name();
    }
    longestSubcommandTermLength(cmd, helper) {
      return helper.visibleCommands(cmd).reduce((max, command) => {
        return Math.max(max, helper.subcommandTerm(command).length);
      }, 0);
    }
    longestOptionTermLength(cmd, helper) {
      return helper.visibleOptions(cmd).reduce((max, option) => {
        return Math.max(max, helper.optionTerm(option).length);
      }, 0);
    }
    longestGlobalOptionTermLength(cmd, helper) {
      return helper.visibleGlobalOptions(cmd).reduce((max, option) => {
        return Math.max(max, helper.optionTerm(option).length);
      }, 0);
    }
    longestArgumentTermLength(cmd, helper) {
      return helper.visibleArguments(cmd).reduce((max, argument) => {
        return Math.max(max, helper.argumentTerm(argument).length);
      }, 0);
    }
    commandUsage(cmd) {
      let cmdName = cmd._name;
      if (cmd._aliases[0]) {
        cmdName = cmdName + "|" + cmd._aliases[0];
      }
      let ancestorCmdNames = "";
      for (let ancestorCmd = cmd.parent;ancestorCmd; ancestorCmd = ancestorCmd.parent) {
        ancestorCmdNames = ancestorCmd.name() + " " + ancestorCmdNames;
      }
      return ancestorCmdNames + cmdName + " " + cmd.usage();
    }
    commandDescription(cmd) {
      return cmd.description();
    }
    subcommandDescription(cmd) {
      return cmd.summary() || cmd.description();
    }
    optionDescription(option) {
      const extraInfo = [];
      if (option.argChoices) {
        extraInfo.push(`choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`);
      }
      if (option.defaultValue !== undefined) {
        const showDefault = option.required || option.optional || option.isBoolean() && typeof option.defaultValue === "boolean";
        if (showDefault) {
          extraInfo.push(`default: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`);
        }
      }
      if (option.presetArg !== undefined && option.optional) {
        extraInfo.push(`preset: ${JSON.stringify(option.presetArg)}`);
      }
      if (option.envVar !== undefined) {
        extraInfo.push(`env: ${option.envVar}`);
      }
      if (extraInfo.length > 0) {
        return `${option.description} (${extraInfo.join(", ")})`;
      }
      return option.description;
    }
    argumentDescription(argument) {
      const extraInfo = [];
      if (argument.argChoices) {
        extraInfo.push(`choices: ${argument.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`);
      }
      if (argument.defaultValue !== undefined) {
        extraInfo.push(`default: ${argument.defaultValueDescription || JSON.stringify(argument.defaultValue)}`);
      }
      if (extraInfo.length > 0) {
        const extraDescripton = `(${extraInfo.join(", ")})`;
        if (argument.description) {
          return `${argument.description} ${extraDescripton}`;
        }
        return extraDescripton;
      }
      return argument.description;
    }
    formatHelp(cmd, helper) {
      const termWidth = helper.padWidth(cmd, helper);
      const helpWidth = helper.helpWidth || 80;
      const itemIndentWidth = 2;
      const itemSeparatorWidth = 2;
      function formatItem(term, description) {
        if (description) {
          const fullText = `${term.padEnd(termWidth + itemSeparatorWidth)}${description}`;
          return helper.wrap(fullText, helpWidth - itemIndentWidth, termWidth + itemSeparatorWidth);
        }
        return term;
      }
      function formatList(textArray) {
        return textArray.join(`
`).replace(/^/gm, " ".repeat(itemIndentWidth));
      }
      let output = [`Usage: ${helper.commandUsage(cmd)}`, ""];
      const commandDescription = helper.commandDescription(cmd);
      if (commandDescription.length > 0) {
        output = output.concat([
          helper.wrap(commandDescription, helpWidth, 0),
          ""
        ]);
      }
      const argumentList = helper.visibleArguments(cmd).map((argument) => {
        return formatItem(helper.argumentTerm(argument), helper.argumentDescription(argument));
      });
      if (argumentList.length > 0) {
        output = output.concat(["Arguments:", formatList(argumentList), ""]);
      }
      const optionList = helper.visibleOptions(cmd).map((option) => {
        return formatItem(helper.optionTerm(option), helper.optionDescription(option));
      });
      if (optionList.length > 0) {
        output = output.concat(["Options:", formatList(optionList), ""]);
      }
      if (this.showGlobalOptions) {
        const globalOptionList = helper.visibleGlobalOptions(cmd).map((option) => {
          return formatItem(helper.optionTerm(option), helper.optionDescription(option));
        });
        if (globalOptionList.length > 0) {
          output = output.concat([
            "Global Options:",
            formatList(globalOptionList),
            ""
          ]);
        }
      }
      const commandList = helper.visibleCommands(cmd).map((cmd2) => {
        return formatItem(helper.subcommandTerm(cmd2), helper.subcommandDescription(cmd2));
      });
      if (commandList.length > 0) {
        output = output.concat(["Commands:", formatList(commandList), ""]);
      }
      return output.join(`
`);
    }
    padWidth(cmd, helper) {
      return Math.max(helper.longestOptionTermLength(cmd, helper), helper.longestGlobalOptionTermLength(cmd, helper), helper.longestSubcommandTermLength(cmd, helper), helper.longestArgumentTermLength(cmd, helper));
    }
    wrap(str, width, indent, minColumnWidth = 40) {
      const indents = " \\f\\t\\v   -   　\uFEFF";
      const manualIndent = new RegExp(`[\\n][${indents}]+`);
      if (str.match(manualIndent))
        return str;
      const columnWidth = width - indent;
      if (columnWidth < minColumnWidth)
        return str;
      const leadingStr = str.slice(0, indent);
      const columnText = str.slice(indent).replace(`\r
`, `
`);
      const indentString = " ".repeat(indent);
      const zeroWidthSpace = "​";
      const breaks = `\\s${zeroWidthSpace}`;
      const regex = new RegExp(`
|.{1,${columnWidth - 1}}([${breaks}]|$)|[^${breaks}]+?([${breaks}]|$)`, "g");
      const lines = columnText.match(regex) || [];
      return leadingStr + lines.map((line, i) => {
        if (line === `
`)
          return "";
        return (i > 0 ? indentString : "") + line.trimEnd();
      }).join(`
`);
    }
  }
  exports.Help = Help;
});

// node_modules/commander/lib/option.js
var require_option = __commonJS((exports) => {
  var { InvalidArgumentError } = require_error();

  class Option {
    constructor(flags, description) {
      this.flags = flags;
      this.description = description || "";
      this.required = flags.includes("<");
      this.optional = flags.includes("[");
      this.variadic = /\w\.\.\.[>\]]$/.test(flags);
      this.mandatory = false;
      const optionFlags = splitOptionFlags(flags);
      this.short = optionFlags.shortFlag;
      this.long = optionFlags.longFlag;
      this.negate = false;
      if (this.long) {
        this.negate = this.long.startsWith("--no-");
      }
      this.defaultValue = undefined;
      this.defaultValueDescription = undefined;
      this.presetArg = undefined;
      this.envVar = undefined;
      this.parseArg = undefined;
      this.hidden = false;
      this.argChoices = undefined;
      this.conflictsWith = [];
      this.implied = undefined;
    }
    default(value, description) {
      this.defaultValue = value;
      this.defaultValueDescription = description;
      return this;
    }
    preset(arg) {
      this.presetArg = arg;
      return this;
    }
    conflicts(names) {
      this.conflictsWith = this.conflictsWith.concat(names);
      return this;
    }
    implies(impliedOptionValues) {
      let newImplied = impliedOptionValues;
      if (typeof impliedOptionValues === "string") {
        newImplied = { [impliedOptionValues]: true };
      }
      this.implied = Object.assign(this.implied || {}, newImplied);
      return this;
    }
    env(name) {
      this.envVar = name;
      return this;
    }
    argParser(fn) {
      this.parseArg = fn;
      return this;
    }
    makeOptionMandatory(mandatory = true) {
      this.mandatory = !!mandatory;
      return this;
    }
    hideHelp(hide = true) {
      this.hidden = !!hide;
      return this;
    }
    _concatValue(value, previous) {
      if (previous === this.defaultValue || !Array.isArray(previous)) {
        return [value];
      }
      return previous.concat(value);
    }
    choices(values) {
      this.argChoices = values.slice();
      this.parseArg = (arg, previous) => {
        if (!this.argChoices.includes(arg)) {
          throw new InvalidArgumentError(`Allowed choices are ${this.argChoices.join(", ")}.`);
        }
        if (this.variadic) {
          return this._concatValue(arg, previous);
        }
        return arg;
      };
      return this;
    }
    name() {
      if (this.long) {
        return this.long.replace(/^--/, "");
      }
      return this.short.replace(/^-/, "");
    }
    attributeName() {
      return camelcase(this.name().replace(/^no-/, ""));
    }
    is(arg) {
      return this.short === arg || this.long === arg;
    }
    isBoolean() {
      return !this.required && !this.optional && !this.negate;
    }
  }

  class DualOptions {
    constructor(options) {
      this.positiveOptions = new Map;
      this.negativeOptions = new Map;
      this.dualOptions = new Set;
      options.forEach((option) => {
        if (option.negate) {
          this.negativeOptions.set(option.attributeName(), option);
        } else {
          this.positiveOptions.set(option.attributeName(), option);
        }
      });
      this.negativeOptions.forEach((value, key) => {
        if (this.positiveOptions.has(key)) {
          this.dualOptions.add(key);
        }
      });
    }
    valueFromOption(value, option) {
      const optionKey = option.attributeName();
      if (!this.dualOptions.has(optionKey))
        return true;
      const preset = this.negativeOptions.get(optionKey).presetArg;
      const negativeValue = preset !== undefined ? preset : false;
      return option.negate === (negativeValue === value);
    }
  }
  function camelcase(str) {
    return str.split("-").reduce((str2, word) => {
      return str2 + word[0].toUpperCase() + word.slice(1);
    });
  }
  function splitOptionFlags(flags) {
    let shortFlag;
    let longFlag;
    const flagParts = flags.split(/[ |,]+/);
    if (flagParts.length > 1 && !/^[[<]/.test(flagParts[1]))
      shortFlag = flagParts.shift();
    longFlag = flagParts.shift();
    if (!shortFlag && /^-[^-]$/.test(longFlag)) {
      shortFlag = longFlag;
      longFlag = undefined;
    }
    return { shortFlag, longFlag };
  }
  exports.Option = Option;
  exports.DualOptions = DualOptions;
});

// node_modules/commander/lib/suggestSimilar.js
var require_suggestSimilar = __commonJS((exports) => {
  var maxDistance = 3;
  function editDistance(a, b) {
    if (Math.abs(a.length - b.length) > maxDistance)
      return Math.max(a.length, b.length);
    const d = [];
    for (let i = 0;i <= a.length; i++) {
      d[i] = [i];
    }
    for (let j = 0;j <= b.length; j++) {
      d[0][j] = j;
    }
    for (let j = 1;j <= b.length; j++) {
      for (let i = 1;i <= a.length; i++) {
        let cost = 1;
        if (a[i - 1] === b[j - 1]) {
          cost = 0;
        } else {
          cost = 1;
        }
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return d[a.length][b.length];
  }
  function suggestSimilar(word, candidates) {
    if (!candidates || candidates.length === 0)
      return "";
    candidates = Array.from(new Set(candidates));
    const searchingOptions = word.startsWith("--");
    if (searchingOptions) {
      word = word.slice(2);
      candidates = candidates.map((candidate) => candidate.slice(2));
    }
    let similar = [];
    let bestDistance = maxDistance;
    const minSimilarity = 0.4;
    candidates.forEach((candidate) => {
      if (candidate.length <= 1)
        return;
      const distance = editDistance(word, candidate);
      const length = Math.max(word.length, candidate.length);
      const similarity = (length - distance) / length;
      if (similarity > minSimilarity) {
        if (distance < bestDistance) {
          bestDistance = distance;
          similar = [candidate];
        } else if (distance === bestDistance) {
          similar.push(candidate);
        }
      }
    });
    similar.sort((a, b) => a.localeCompare(b));
    if (searchingOptions) {
      similar = similar.map((candidate) => `--${candidate}`);
    }
    if (similar.length > 1) {
      return `
(Did you mean one of ${similar.join(", ")}?)`;
    }
    if (similar.length === 1) {
      return `
(Did you mean ${similar[0]}?)`;
    }
    return "";
  }
  exports.suggestSimilar = suggestSimilar;
});

// node_modules/commander/lib/command.js
var require_command = __commonJS((exports) => {
  var EventEmitter = __require("node:events").EventEmitter;
  var childProcess = __require("node:child_process");
  var path = __require("node:path");
  var fs = __require("node:fs");
  var process2 = __require("node:process");
  var { Argument, humanReadableArgName } = require_argument();
  var { CommanderError } = require_error();
  var { Help } = require_help();
  var { Option, DualOptions } = require_option();
  var { suggestSimilar } = require_suggestSimilar();

  class Command extends EventEmitter {
    constructor(name) {
      super();
      this.commands = [];
      this.options = [];
      this.parent = null;
      this._allowUnknownOption = false;
      this._allowExcessArguments = true;
      this.registeredArguments = [];
      this._args = this.registeredArguments;
      this.args = [];
      this.rawArgs = [];
      this.processedArgs = [];
      this._scriptPath = null;
      this._name = name || "";
      this._optionValues = {};
      this._optionValueSources = {};
      this._storeOptionsAsProperties = false;
      this._actionHandler = null;
      this._executableHandler = false;
      this._executableFile = null;
      this._executableDir = null;
      this._defaultCommandName = null;
      this._exitCallback = null;
      this._aliases = [];
      this._combineFlagAndOptionalValue = true;
      this._description = "";
      this._summary = "";
      this._argsDescription = undefined;
      this._enablePositionalOptions = false;
      this._passThroughOptions = false;
      this._lifeCycleHooks = {};
      this._showHelpAfterError = false;
      this._showSuggestionAfterError = true;
      this._outputConfiguration = {
        writeOut: (str) => process2.stdout.write(str),
        writeErr: (str) => process2.stderr.write(str),
        getOutHelpWidth: () => process2.stdout.isTTY ? process2.stdout.columns : undefined,
        getErrHelpWidth: () => process2.stderr.isTTY ? process2.stderr.columns : undefined,
        outputError: (str, write) => write(str)
      };
      this._hidden = false;
      this._helpOption = undefined;
      this._addImplicitHelpCommand = undefined;
      this._helpCommand = undefined;
      this._helpConfiguration = {};
    }
    copyInheritedSettings(sourceCommand) {
      this._outputConfiguration = sourceCommand._outputConfiguration;
      this._helpOption = sourceCommand._helpOption;
      this._helpCommand = sourceCommand._helpCommand;
      this._helpConfiguration = sourceCommand._helpConfiguration;
      this._exitCallback = sourceCommand._exitCallback;
      this._storeOptionsAsProperties = sourceCommand._storeOptionsAsProperties;
      this._combineFlagAndOptionalValue = sourceCommand._combineFlagAndOptionalValue;
      this._allowExcessArguments = sourceCommand._allowExcessArguments;
      this._enablePositionalOptions = sourceCommand._enablePositionalOptions;
      this._showHelpAfterError = sourceCommand._showHelpAfterError;
      this._showSuggestionAfterError = sourceCommand._showSuggestionAfterError;
      return this;
    }
    _getCommandAndAncestors() {
      const result = [];
      for (let command = this;command; command = command.parent) {
        result.push(command);
      }
      return result;
    }
    command(nameAndArgs, actionOptsOrExecDesc, execOpts) {
      let desc = actionOptsOrExecDesc;
      let opts = execOpts;
      if (typeof desc === "object" && desc !== null) {
        opts = desc;
        desc = null;
      }
      opts = opts || {};
      const [, name, args] = nameAndArgs.match(/([^ ]+) *(.*)/);
      const cmd = this.createCommand(name);
      if (desc) {
        cmd.description(desc);
        cmd._executableHandler = true;
      }
      if (opts.isDefault)
        this._defaultCommandName = cmd._name;
      cmd._hidden = !!(opts.noHelp || opts.hidden);
      cmd._executableFile = opts.executableFile || null;
      if (args)
        cmd.arguments(args);
      this._registerCommand(cmd);
      cmd.parent = this;
      cmd.copyInheritedSettings(this);
      if (desc)
        return this;
      return cmd;
    }
    createCommand(name) {
      return new Command(name);
    }
    createHelp() {
      return Object.assign(new Help, this.configureHelp());
    }
    configureHelp(configuration) {
      if (configuration === undefined)
        return this._helpConfiguration;
      this._helpConfiguration = configuration;
      return this;
    }
    configureOutput(configuration) {
      if (configuration === undefined)
        return this._outputConfiguration;
      Object.assign(this._outputConfiguration, configuration);
      return this;
    }
    showHelpAfterError(displayHelp = true) {
      if (typeof displayHelp !== "string")
        displayHelp = !!displayHelp;
      this._showHelpAfterError = displayHelp;
      return this;
    }
    showSuggestionAfterError(displaySuggestion = true) {
      this._showSuggestionAfterError = !!displaySuggestion;
      return this;
    }
    addCommand(cmd, opts) {
      if (!cmd._name) {
        throw new Error(`Command passed to .addCommand() must have a name
- specify the name in Command constructor or using .name()`);
      }
      opts = opts || {};
      if (opts.isDefault)
        this._defaultCommandName = cmd._name;
      if (opts.noHelp || opts.hidden)
        cmd._hidden = true;
      this._registerCommand(cmd);
      cmd.parent = this;
      cmd._checkForBrokenPassThrough();
      return this;
    }
    createArgument(name, description) {
      return new Argument(name, description);
    }
    argument(name, description, fn, defaultValue) {
      const argument = this.createArgument(name, description);
      if (typeof fn === "function") {
        argument.default(defaultValue).argParser(fn);
      } else {
        argument.default(fn);
      }
      this.addArgument(argument);
      return this;
    }
    arguments(names) {
      names.trim().split(/ +/).forEach((detail) => {
        this.argument(detail);
      });
      return this;
    }
    addArgument(argument) {
      const previousArgument = this.registeredArguments.slice(-1)[0];
      if (previousArgument && previousArgument.variadic) {
        throw new Error(`only the last argument can be variadic '${previousArgument.name()}'`);
      }
      if (argument.required && argument.defaultValue !== undefined && argument.parseArg === undefined) {
        throw new Error(`a default value for a required argument is never used: '${argument.name()}'`);
      }
      this.registeredArguments.push(argument);
      return this;
    }
    helpCommand(enableOrNameAndArgs, description) {
      if (typeof enableOrNameAndArgs === "boolean") {
        this._addImplicitHelpCommand = enableOrNameAndArgs;
        return this;
      }
      enableOrNameAndArgs = enableOrNameAndArgs ?? "help [command]";
      const [, helpName, helpArgs] = enableOrNameAndArgs.match(/([^ ]+) *(.*)/);
      const helpDescription = description ?? "display help for command";
      const helpCommand = this.createCommand(helpName);
      helpCommand.helpOption(false);
      if (helpArgs)
        helpCommand.arguments(helpArgs);
      if (helpDescription)
        helpCommand.description(helpDescription);
      this._addImplicitHelpCommand = true;
      this._helpCommand = helpCommand;
      return this;
    }
    addHelpCommand(helpCommand, deprecatedDescription) {
      if (typeof helpCommand !== "object") {
        this.helpCommand(helpCommand, deprecatedDescription);
        return this;
      }
      this._addImplicitHelpCommand = true;
      this._helpCommand = helpCommand;
      return this;
    }
    _getHelpCommand() {
      const hasImplicitHelpCommand = this._addImplicitHelpCommand ?? (this.commands.length && !this._actionHandler && !this._findCommand("help"));
      if (hasImplicitHelpCommand) {
        if (this._helpCommand === undefined) {
          this.helpCommand(undefined, undefined);
        }
        return this._helpCommand;
      }
      return null;
    }
    hook(event, listener) {
      const allowedValues = ["preSubcommand", "preAction", "postAction"];
      if (!allowedValues.includes(event)) {
        throw new Error(`Unexpected value for event passed to hook : '${event}'.
Expecting one of '${allowedValues.join("', '")}'`);
      }
      if (this._lifeCycleHooks[event]) {
        this._lifeCycleHooks[event].push(listener);
      } else {
        this._lifeCycleHooks[event] = [listener];
      }
      return this;
    }
    exitOverride(fn) {
      if (fn) {
        this._exitCallback = fn;
      } else {
        this._exitCallback = (err) => {
          if (err.code !== "commander.executeSubCommandAsync") {
            throw err;
          } else {}
        };
      }
      return this;
    }
    _exit(exitCode, code, message) {
      if (this._exitCallback) {
        this._exitCallback(new CommanderError(exitCode, code, message));
      }
      process2.exit(exitCode);
    }
    action(fn) {
      const listener = (args) => {
        const expectedArgsCount = this.registeredArguments.length;
        const actionArgs = args.slice(0, expectedArgsCount);
        if (this._storeOptionsAsProperties) {
          actionArgs[expectedArgsCount] = this;
        } else {
          actionArgs[expectedArgsCount] = this.opts();
        }
        actionArgs.push(this);
        return fn.apply(this, actionArgs);
      };
      this._actionHandler = listener;
      return this;
    }
    createOption(flags, description) {
      return new Option(flags, description);
    }
    _callParseArg(target, value, previous, invalidArgumentMessage) {
      try {
        return target.parseArg(value, previous);
      } catch (err) {
        if (err.code === "commander.invalidArgument") {
          const message = `${invalidArgumentMessage} ${err.message}`;
          this.error(message, { exitCode: err.exitCode, code: err.code });
        }
        throw err;
      }
    }
    _registerOption(option) {
      const matchingOption = option.short && this._findOption(option.short) || option.long && this._findOption(option.long);
      if (matchingOption) {
        const matchingFlag = option.long && this._findOption(option.long) ? option.long : option.short;
        throw new Error(`Cannot add option '${option.flags}'${this._name && ` to command '${this._name}'`} due to conflicting flag '${matchingFlag}'
-  already used by option '${matchingOption.flags}'`);
      }
      this.options.push(option);
    }
    _registerCommand(command) {
      const knownBy = (cmd) => {
        return [cmd.name()].concat(cmd.aliases());
      };
      const alreadyUsed = knownBy(command).find((name) => this._findCommand(name));
      if (alreadyUsed) {
        const existingCmd = knownBy(this._findCommand(alreadyUsed)).join("|");
        const newCmd = knownBy(command).join("|");
        throw new Error(`cannot add command '${newCmd}' as already have command '${existingCmd}'`);
      }
      this.commands.push(command);
    }
    addOption(option) {
      this._registerOption(option);
      const oname = option.name();
      const name = option.attributeName();
      if (option.negate) {
        const positiveLongFlag = option.long.replace(/^--no-/, "--");
        if (!this._findOption(positiveLongFlag)) {
          this.setOptionValueWithSource(name, option.defaultValue === undefined ? true : option.defaultValue, "default");
        }
      } else if (option.defaultValue !== undefined) {
        this.setOptionValueWithSource(name, option.defaultValue, "default");
      }
      const handleOptionValue = (val, invalidValueMessage, valueSource) => {
        if (val == null && option.presetArg !== undefined) {
          val = option.presetArg;
        }
        const oldValue = this.getOptionValue(name);
        if (val !== null && option.parseArg) {
          val = this._callParseArg(option, val, oldValue, invalidValueMessage);
        } else if (val !== null && option.variadic) {
          val = option._concatValue(val, oldValue);
        }
        if (val == null) {
          if (option.negate) {
            val = false;
          } else if (option.isBoolean() || option.optional) {
            val = true;
          } else {
            val = "";
          }
        }
        this.setOptionValueWithSource(name, val, valueSource);
      };
      this.on("option:" + oname, (val) => {
        const invalidValueMessage = `error: option '${option.flags}' argument '${val}' is invalid.`;
        handleOptionValue(val, invalidValueMessage, "cli");
      });
      if (option.envVar) {
        this.on("optionEnv:" + oname, (val) => {
          const invalidValueMessage = `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`;
          handleOptionValue(val, invalidValueMessage, "env");
        });
      }
      return this;
    }
    _optionEx(config, flags, description, fn, defaultValue) {
      if (typeof flags === "object" && flags instanceof Option) {
        throw new Error("To add an Option object use addOption() instead of option() or requiredOption()");
      }
      const option = this.createOption(flags, description);
      option.makeOptionMandatory(!!config.mandatory);
      if (typeof fn === "function") {
        option.default(defaultValue).argParser(fn);
      } else if (fn instanceof RegExp) {
        const regex = fn;
        fn = (val, def) => {
          const m = regex.exec(val);
          return m ? m[0] : def;
        };
        option.default(defaultValue).argParser(fn);
      } else {
        option.default(fn);
      }
      return this.addOption(option);
    }
    option(flags, description, parseArg, defaultValue) {
      return this._optionEx({}, flags, description, parseArg, defaultValue);
    }
    requiredOption(flags, description, parseArg, defaultValue) {
      return this._optionEx({ mandatory: true }, flags, description, parseArg, defaultValue);
    }
    combineFlagAndOptionalValue(combine = true) {
      this._combineFlagAndOptionalValue = !!combine;
      return this;
    }
    allowUnknownOption(allowUnknown = true) {
      this._allowUnknownOption = !!allowUnknown;
      return this;
    }
    allowExcessArguments(allowExcess = true) {
      this._allowExcessArguments = !!allowExcess;
      return this;
    }
    enablePositionalOptions(positional = true) {
      this._enablePositionalOptions = !!positional;
      return this;
    }
    passThroughOptions(passThrough = true) {
      this._passThroughOptions = !!passThrough;
      this._checkForBrokenPassThrough();
      return this;
    }
    _checkForBrokenPassThrough() {
      if (this.parent && this._passThroughOptions && !this.parent._enablePositionalOptions) {
        throw new Error(`passThroughOptions cannot be used for '${this._name}' without turning on enablePositionalOptions for parent command(s)`);
      }
    }
    storeOptionsAsProperties(storeAsProperties = true) {
      if (this.options.length) {
        throw new Error("call .storeOptionsAsProperties() before adding options");
      }
      if (Object.keys(this._optionValues).length) {
        throw new Error("call .storeOptionsAsProperties() before setting option values");
      }
      this._storeOptionsAsProperties = !!storeAsProperties;
      return this;
    }
    getOptionValue(key) {
      if (this._storeOptionsAsProperties) {
        return this[key];
      }
      return this._optionValues[key];
    }
    setOptionValue(key, value) {
      return this.setOptionValueWithSource(key, value, undefined);
    }
    setOptionValueWithSource(key, value, source) {
      if (this._storeOptionsAsProperties) {
        this[key] = value;
      } else {
        this._optionValues[key] = value;
      }
      this._optionValueSources[key] = source;
      return this;
    }
    getOptionValueSource(key) {
      return this._optionValueSources[key];
    }
    getOptionValueSourceWithGlobals(key) {
      let source;
      this._getCommandAndAncestors().forEach((cmd) => {
        if (cmd.getOptionValueSource(key) !== undefined) {
          source = cmd.getOptionValueSource(key);
        }
      });
      return source;
    }
    _prepareUserArgs(argv, parseOptions) {
      if (argv !== undefined && !Array.isArray(argv)) {
        throw new Error("first parameter to parse must be array or undefined");
      }
      parseOptions = parseOptions || {};
      if (argv === undefined && parseOptions.from === undefined) {
        if (process2.versions?.electron) {
          parseOptions.from = "electron";
        }
        const execArgv = process2.execArgv ?? [];
        if (execArgv.includes("-e") || execArgv.includes("--eval") || execArgv.includes("-p") || execArgv.includes("--print")) {
          parseOptions.from = "eval";
        }
      }
      if (argv === undefined) {
        argv = process2.argv;
      }
      this.rawArgs = argv.slice();
      let userArgs;
      switch (parseOptions.from) {
        case undefined:
        case "node":
          this._scriptPath = argv[1];
          userArgs = argv.slice(2);
          break;
        case "electron":
          if (process2.defaultApp) {
            this._scriptPath = argv[1];
            userArgs = argv.slice(2);
          } else {
            userArgs = argv.slice(1);
          }
          break;
        case "user":
          userArgs = argv.slice(0);
          break;
        case "eval":
          userArgs = argv.slice(1);
          break;
        default:
          throw new Error(`unexpected parse option { from: '${parseOptions.from}' }`);
      }
      if (!this._name && this._scriptPath)
        this.nameFromFilename(this._scriptPath);
      this._name = this._name || "program";
      return userArgs;
    }
    parse(argv, parseOptions) {
      const userArgs = this._prepareUserArgs(argv, parseOptions);
      this._parseCommand([], userArgs);
      return this;
    }
    async parseAsync(argv, parseOptions) {
      const userArgs = this._prepareUserArgs(argv, parseOptions);
      await this._parseCommand([], userArgs);
      return this;
    }
    _executeSubCommand(subcommand, args) {
      args = args.slice();
      let launchWithNode = false;
      const sourceExt = [".js", ".ts", ".tsx", ".mjs", ".cjs"];
      function findFile(baseDir, baseName) {
        const localBin = path.resolve(baseDir, baseName);
        if (fs.existsSync(localBin))
          return localBin;
        if (sourceExt.includes(path.extname(baseName)))
          return;
        const foundExt = sourceExt.find((ext) => fs.existsSync(`${localBin}${ext}`));
        if (foundExt)
          return `${localBin}${foundExt}`;
        return;
      }
      this._checkForMissingMandatoryOptions();
      this._checkForConflictingOptions();
      let executableFile = subcommand._executableFile || `${this._name}-${subcommand._name}`;
      let executableDir = this._executableDir || "";
      if (this._scriptPath) {
        let resolvedScriptPath;
        try {
          resolvedScriptPath = fs.realpathSync(this._scriptPath);
        } catch (err) {
          resolvedScriptPath = this._scriptPath;
        }
        executableDir = path.resolve(path.dirname(resolvedScriptPath), executableDir);
      }
      if (executableDir) {
        let localFile = findFile(executableDir, executableFile);
        if (!localFile && !subcommand._executableFile && this._scriptPath) {
          const legacyName = path.basename(this._scriptPath, path.extname(this._scriptPath));
          if (legacyName !== this._name) {
            localFile = findFile(executableDir, `${legacyName}-${subcommand._name}`);
          }
        }
        executableFile = localFile || executableFile;
      }
      launchWithNode = sourceExt.includes(path.extname(executableFile));
      let proc;
      if (process2.platform !== "win32") {
        if (launchWithNode) {
          args.unshift(executableFile);
          args = incrementNodeInspectorPort(process2.execArgv).concat(args);
          proc = childProcess.spawn(process2.argv[0], args, { stdio: "inherit" });
        } else {
          proc = childProcess.spawn(executableFile, args, { stdio: "inherit" });
        }
      } else {
        args.unshift(executableFile);
        args = incrementNodeInspectorPort(process2.execArgv).concat(args);
        proc = childProcess.spawn(process2.execPath, args, { stdio: "inherit" });
      }
      if (!proc.killed) {
        const signals = ["SIGUSR1", "SIGUSR2", "SIGTERM", "SIGINT", "SIGHUP"];
        signals.forEach((signal) => {
          process2.on(signal, () => {
            if (proc.killed === false && proc.exitCode === null) {
              proc.kill(signal);
            }
          });
        });
      }
      const exitCallback = this._exitCallback;
      proc.on("close", (code) => {
        code = code ?? 1;
        if (!exitCallback) {
          process2.exit(code);
        } else {
          exitCallback(new CommanderError(code, "commander.executeSubCommandAsync", "(close)"));
        }
      });
      proc.on("error", (err) => {
        if (err.code === "ENOENT") {
          const executableDirMessage = executableDir ? `searched for local subcommand relative to directory '${executableDir}'` : "no directory for search for local subcommand, use .executableDir() to supply a custom directory";
          const executableMissing = `'${executableFile}' does not exist
 - if '${subcommand._name}' is not meant to be an executable command, remove description parameter from '.command()' and use '.description()' instead
 - if the default executable name is not suitable, use the executableFile option to supply a custom name or path
 - ${executableDirMessage}`;
          throw new Error(executableMissing);
        } else if (err.code === "EACCES") {
          throw new Error(`'${executableFile}' not executable`);
        }
        if (!exitCallback) {
          process2.exit(1);
        } else {
          const wrappedError = new CommanderError(1, "commander.executeSubCommandAsync", "(error)");
          wrappedError.nestedError = err;
          exitCallback(wrappedError);
        }
      });
      this.runningCommand = proc;
    }
    _dispatchSubcommand(commandName, operands, unknown) {
      const subCommand = this._findCommand(commandName);
      if (!subCommand)
        this.help({ error: true });
      let promiseChain;
      promiseChain = this._chainOrCallSubCommandHook(promiseChain, subCommand, "preSubcommand");
      promiseChain = this._chainOrCall(promiseChain, () => {
        if (subCommand._executableHandler) {
          this._executeSubCommand(subCommand, operands.concat(unknown));
        } else {
          return subCommand._parseCommand(operands, unknown);
        }
      });
      return promiseChain;
    }
    _dispatchHelpCommand(subcommandName) {
      if (!subcommandName) {
        this.help();
      }
      const subCommand = this._findCommand(subcommandName);
      if (subCommand && !subCommand._executableHandler) {
        subCommand.help();
      }
      return this._dispatchSubcommand(subcommandName, [], [this._getHelpOption()?.long ?? this._getHelpOption()?.short ?? "--help"]);
    }
    _checkNumberOfArguments() {
      this.registeredArguments.forEach((arg, i) => {
        if (arg.required && this.args[i] == null) {
          this.missingArgument(arg.name());
        }
      });
      if (this.registeredArguments.length > 0 && this.registeredArguments[this.registeredArguments.length - 1].variadic) {
        return;
      }
      if (this.args.length > this.registeredArguments.length) {
        this._excessArguments(this.args);
      }
    }
    _processArguments() {
      const myParseArg = (argument, value, previous) => {
        let parsedValue = value;
        if (value !== null && argument.parseArg) {
          const invalidValueMessage = `error: command-argument value '${value}' is invalid for argument '${argument.name()}'.`;
          parsedValue = this._callParseArg(argument, value, previous, invalidValueMessage);
        }
        return parsedValue;
      };
      this._checkNumberOfArguments();
      const processedArgs = [];
      this.registeredArguments.forEach((declaredArg, index) => {
        let value = declaredArg.defaultValue;
        if (declaredArg.variadic) {
          if (index < this.args.length) {
            value = this.args.slice(index);
            if (declaredArg.parseArg) {
              value = value.reduce((processed, v) => {
                return myParseArg(declaredArg, v, processed);
              }, declaredArg.defaultValue);
            }
          } else if (value === undefined) {
            value = [];
          }
        } else if (index < this.args.length) {
          value = this.args[index];
          if (declaredArg.parseArg) {
            value = myParseArg(declaredArg, value, declaredArg.defaultValue);
          }
        }
        processedArgs[index] = value;
      });
      this.processedArgs = processedArgs;
    }
    _chainOrCall(promise, fn) {
      if (promise && promise.then && typeof promise.then === "function") {
        return promise.then(() => fn());
      }
      return fn();
    }
    _chainOrCallHooks(promise, event) {
      let result = promise;
      const hooks = [];
      this._getCommandAndAncestors().reverse().filter((cmd) => cmd._lifeCycleHooks[event] !== undefined).forEach((hookedCommand) => {
        hookedCommand._lifeCycleHooks[event].forEach((callback) => {
          hooks.push({ hookedCommand, callback });
        });
      });
      if (event === "postAction") {
        hooks.reverse();
      }
      hooks.forEach((hookDetail) => {
        result = this._chainOrCall(result, () => {
          return hookDetail.callback(hookDetail.hookedCommand, this);
        });
      });
      return result;
    }
    _chainOrCallSubCommandHook(promise, subCommand, event) {
      let result = promise;
      if (this._lifeCycleHooks[event] !== undefined) {
        this._lifeCycleHooks[event].forEach((hook) => {
          result = this._chainOrCall(result, () => {
            return hook(this, subCommand);
          });
        });
      }
      return result;
    }
    _parseCommand(operands, unknown) {
      const parsed = this.parseOptions(unknown);
      this._parseOptionsEnv();
      this._parseOptionsImplied();
      operands = operands.concat(parsed.operands);
      unknown = parsed.unknown;
      this.args = operands.concat(unknown);
      if (operands && this._findCommand(operands[0])) {
        return this._dispatchSubcommand(operands[0], operands.slice(1), unknown);
      }
      if (this._getHelpCommand() && operands[0] === this._getHelpCommand().name()) {
        return this._dispatchHelpCommand(operands[1]);
      }
      if (this._defaultCommandName) {
        this._outputHelpIfRequested(unknown);
        return this._dispatchSubcommand(this._defaultCommandName, operands, unknown);
      }
      if (this.commands.length && this.args.length === 0 && !this._actionHandler && !this._defaultCommandName) {
        this.help({ error: true });
      }
      this._outputHelpIfRequested(parsed.unknown);
      this._checkForMissingMandatoryOptions();
      this._checkForConflictingOptions();
      const checkForUnknownOptions = () => {
        if (parsed.unknown.length > 0) {
          this.unknownOption(parsed.unknown[0]);
        }
      };
      const commandEvent = `command:${this.name()}`;
      if (this._actionHandler) {
        checkForUnknownOptions();
        this._processArguments();
        let promiseChain;
        promiseChain = this._chainOrCallHooks(promiseChain, "preAction");
        promiseChain = this._chainOrCall(promiseChain, () => this._actionHandler(this.processedArgs));
        if (this.parent) {
          promiseChain = this._chainOrCall(promiseChain, () => {
            this.parent.emit(commandEvent, operands, unknown);
          });
        }
        promiseChain = this._chainOrCallHooks(promiseChain, "postAction");
        return promiseChain;
      }
      if (this.parent && this.parent.listenerCount(commandEvent)) {
        checkForUnknownOptions();
        this._processArguments();
        this.parent.emit(commandEvent, operands, unknown);
      } else if (operands.length) {
        if (this._findCommand("*")) {
          return this._dispatchSubcommand("*", operands, unknown);
        }
        if (this.listenerCount("command:*")) {
          this.emit("command:*", operands, unknown);
        } else if (this.commands.length) {
          this.unknownCommand();
        } else {
          checkForUnknownOptions();
          this._processArguments();
        }
      } else if (this.commands.length) {
        checkForUnknownOptions();
        this.help({ error: true });
      } else {
        checkForUnknownOptions();
        this._processArguments();
      }
    }
    _findCommand(name) {
      if (!name)
        return;
      return this.commands.find((cmd) => cmd._name === name || cmd._aliases.includes(name));
    }
    _findOption(arg) {
      return this.options.find((option) => option.is(arg));
    }
    _checkForMissingMandatoryOptions() {
      this._getCommandAndAncestors().forEach((cmd) => {
        cmd.options.forEach((anOption) => {
          if (anOption.mandatory && cmd.getOptionValue(anOption.attributeName()) === undefined) {
            cmd.missingMandatoryOptionValue(anOption);
          }
        });
      });
    }
    _checkForConflictingLocalOptions() {
      const definedNonDefaultOptions = this.options.filter((option) => {
        const optionKey = option.attributeName();
        if (this.getOptionValue(optionKey) === undefined) {
          return false;
        }
        return this.getOptionValueSource(optionKey) !== "default";
      });
      const optionsWithConflicting = definedNonDefaultOptions.filter((option) => option.conflictsWith.length > 0);
      optionsWithConflicting.forEach((option) => {
        const conflictingAndDefined = definedNonDefaultOptions.find((defined) => option.conflictsWith.includes(defined.attributeName()));
        if (conflictingAndDefined) {
          this._conflictingOption(option, conflictingAndDefined);
        }
      });
    }
    _checkForConflictingOptions() {
      this._getCommandAndAncestors().forEach((cmd) => {
        cmd._checkForConflictingLocalOptions();
      });
    }
    parseOptions(argv) {
      const operands = [];
      const unknown = [];
      let dest = operands;
      const args = argv.slice();
      function maybeOption(arg) {
        return arg.length > 1 && arg[0] === "-";
      }
      let activeVariadicOption = null;
      while (args.length) {
        const arg = args.shift();
        if (arg === "--") {
          if (dest === unknown)
            dest.push(arg);
          dest.push(...args);
          break;
        }
        if (activeVariadicOption && !maybeOption(arg)) {
          this.emit(`option:${activeVariadicOption.name()}`, arg);
          continue;
        }
        activeVariadicOption = null;
        if (maybeOption(arg)) {
          const option = this._findOption(arg);
          if (option) {
            if (option.required) {
              const value = args.shift();
              if (value === undefined)
                this.optionMissingArgument(option);
              this.emit(`option:${option.name()}`, value);
            } else if (option.optional) {
              let value = null;
              if (args.length > 0 && !maybeOption(args[0])) {
                value = args.shift();
              }
              this.emit(`option:${option.name()}`, value);
            } else {
              this.emit(`option:${option.name()}`);
            }
            activeVariadicOption = option.variadic ? option : null;
            continue;
          }
        }
        if (arg.length > 2 && arg[0] === "-" && arg[1] !== "-") {
          const option = this._findOption(`-${arg[1]}`);
          if (option) {
            if (option.required || option.optional && this._combineFlagAndOptionalValue) {
              this.emit(`option:${option.name()}`, arg.slice(2));
            } else {
              this.emit(`option:${option.name()}`);
              args.unshift(`-${arg.slice(2)}`);
            }
            continue;
          }
        }
        if (/^--[^=]+=/.test(arg)) {
          const index = arg.indexOf("=");
          const option = this._findOption(arg.slice(0, index));
          if (option && (option.required || option.optional)) {
            this.emit(`option:${option.name()}`, arg.slice(index + 1));
            continue;
          }
        }
        if (maybeOption(arg)) {
          dest = unknown;
        }
        if ((this._enablePositionalOptions || this._passThroughOptions) && operands.length === 0 && unknown.length === 0) {
          if (this._findCommand(arg)) {
            operands.push(arg);
            if (args.length > 0)
              unknown.push(...args);
            break;
          } else if (this._getHelpCommand() && arg === this._getHelpCommand().name()) {
            operands.push(arg);
            if (args.length > 0)
              operands.push(...args);
            break;
          } else if (this._defaultCommandName) {
            unknown.push(arg);
            if (args.length > 0)
              unknown.push(...args);
            break;
          }
        }
        if (this._passThroughOptions) {
          dest.push(arg);
          if (args.length > 0)
            dest.push(...args);
          break;
        }
        dest.push(arg);
      }
      return { operands, unknown };
    }
    opts() {
      if (this._storeOptionsAsProperties) {
        const result = {};
        const len = this.options.length;
        for (let i = 0;i < len; i++) {
          const key = this.options[i].attributeName();
          result[key] = key === this._versionOptionName ? this._version : this[key];
        }
        return result;
      }
      return this._optionValues;
    }
    optsWithGlobals() {
      return this._getCommandAndAncestors().reduce((combinedOptions, cmd) => Object.assign(combinedOptions, cmd.opts()), {});
    }
    error(message, errorOptions) {
      this._outputConfiguration.outputError(`${message}
`, this._outputConfiguration.writeErr);
      if (typeof this._showHelpAfterError === "string") {
        this._outputConfiguration.writeErr(`${this._showHelpAfterError}
`);
      } else if (this._showHelpAfterError) {
        this._outputConfiguration.writeErr(`
`);
        this.outputHelp({ error: true });
      }
      const config = errorOptions || {};
      const exitCode = config.exitCode || 1;
      const code = config.code || "commander.error";
      this._exit(exitCode, code, message);
    }
    _parseOptionsEnv() {
      this.options.forEach((option) => {
        if (option.envVar && option.envVar in process2.env) {
          const optionKey = option.attributeName();
          if (this.getOptionValue(optionKey) === undefined || ["default", "config", "env"].includes(this.getOptionValueSource(optionKey))) {
            if (option.required || option.optional) {
              this.emit(`optionEnv:${option.name()}`, process2.env[option.envVar]);
            } else {
              this.emit(`optionEnv:${option.name()}`);
            }
          }
        }
      });
    }
    _parseOptionsImplied() {
      const dualHelper = new DualOptions(this.options);
      const hasCustomOptionValue = (optionKey) => {
        return this.getOptionValue(optionKey) !== undefined && !["default", "implied"].includes(this.getOptionValueSource(optionKey));
      };
      this.options.filter((option) => option.implied !== undefined && hasCustomOptionValue(option.attributeName()) && dualHelper.valueFromOption(this.getOptionValue(option.attributeName()), option)).forEach((option) => {
        Object.keys(option.implied).filter((impliedKey) => !hasCustomOptionValue(impliedKey)).forEach((impliedKey) => {
          this.setOptionValueWithSource(impliedKey, option.implied[impliedKey], "implied");
        });
      });
    }
    missingArgument(name) {
      const message = `error: missing required argument '${name}'`;
      this.error(message, { code: "commander.missingArgument" });
    }
    optionMissingArgument(option) {
      const message = `error: option '${option.flags}' argument missing`;
      this.error(message, { code: "commander.optionMissingArgument" });
    }
    missingMandatoryOptionValue(option) {
      const message = `error: required option '${option.flags}' not specified`;
      this.error(message, { code: "commander.missingMandatoryOptionValue" });
    }
    _conflictingOption(option, conflictingOption) {
      const findBestOptionFromValue = (option2) => {
        const optionKey = option2.attributeName();
        const optionValue = this.getOptionValue(optionKey);
        const negativeOption = this.options.find((target) => target.negate && optionKey === target.attributeName());
        const positiveOption = this.options.find((target) => !target.negate && optionKey === target.attributeName());
        if (negativeOption && (negativeOption.presetArg === undefined && optionValue === false || negativeOption.presetArg !== undefined && optionValue === negativeOption.presetArg)) {
          return negativeOption;
        }
        return positiveOption || option2;
      };
      const getErrorMessage = (option2) => {
        const bestOption = findBestOptionFromValue(option2);
        const optionKey = bestOption.attributeName();
        const source = this.getOptionValueSource(optionKey);
        if (source === "env") {
          return `environment variable '${bestOption.envVar}'`;
        }
        return `option '${bestOption.flags}'`;
      };
      const message = `error: ${getErrorMessage(option)} cannot be used with ${getErrorMessage(conflictingOption)}`;
      this.error(message, { code: "commander.conflictingOption" });
    }
    unknownOption(flag) {
      if (this._allowUnknownOption)
        return;
      let suggestion = "";
      if (flag.startsWith("--") && this._showSuggestionAfterError) {
        let candidateFlags = [];
        let command = this;
        do {
          const moreFlags = command.createHelp().visibleOptions(command).filter((option) => option.long).map((option) => option.long);
          candidateFlags = candidateFlags.concat(moreFlags);
          command = command.parent;
        } while (command && !command._enablePositionalOptions);
        suggestion = suggestSimilar(flag, candidateFlags);
      }
      const message = `error: unknown option '${flag}'${suggestion}`;
      this.error(message, { code: "commander.unknownOption" });
    }
    _excessArguments(receivedArgs) {
      if (this._allowExcessArguments)
        return;
      const expected = this.registeredArguments.length;
      const s = expected === 1 ? "" : "s";
      const forSubcommand = this.parent ? ` for '${this.name()}'` : "";
      const message = `error: too many arguments${forSubcommand}. Expected ${expected} argument${s} but got ${receivedArgs.length}.`;
      this.error(message, { code: "commander.excessArguments" });
    }
    unknownCommand() {
      const unknownName = this.args[0];
      let suggestion = "";
      if (this._showSuggestionAfterError) {
        const candidateNames = [];
        this.createHelp().visibleCommands(this).forEach((command) => {
          candidateNames.push(command.name());
          if (command.alias())
            candidateNames.push(command.alias());
        });
        suggestion = suggestSimilar(unknownName, candidateNames);
      }
      const message = `error: unknown command '${unknownName}'${suggestion}`;
      this.error(message, { code: "commander.unknownCommand" });
    }
    version(str, flags, description) {
      if (str === undefined)
        return this._version;
      this._version = str;
      flags = flags || "-V, --version";
      description = description || "output the version number";
      const versionOption = this.createOption(flags, description);
      this._versionOptionName = versionOption.attributeName();
      this._registerOption(versionOption);
      this.on("option:" + versionOption.name(), () => {
        this._outputConfiguration.writeOut(`${str}
`);
        this._exit(0, "commander.version", str);
      });
      return this;
    }
    description(str, argsDescription) {
      if (str === undefined && argsDescription === undefined)
        return this._description;
      this._description = str;
      if (argsDescription) {
        this._argsDescription = argsDescription;
      }
      return this;
    }
    summary(str) {
      if (str === undefined)
        return this._summary;
      this._summary = str;
      return this;
    }
    alias(alias) {
      if (alias === undefined)
        return this._aliases[0];
      let command = this;
      if (this.commands.length !== 0 && this.commands[this.commands.length - 1]._executableHandler) {
        command = this.commands[this.commands.length - 1];
      }
      if (alias === command._name)
        throw new Error("Command alias can't be the same as its name");
      const matchingCommand = this.parent?._findCommand(alias);
      if (matchingCommand) {
        const existingCmd = [matchingCommand.name()].concat(matchingCommand.aliases()).join("|");
        throw new Error(`cannot add alias '${alias}' to command '${this.name()}' as already have command '${existingCmd}'`);
      }
      command._aliases.push(alias);
      return this;
    }
    aliases(aliases) {
      if (aliases === undefined)
        return this._aliases;
      aliases.forEach((alias) => this.alias(alias));
      return this;
    }
    usage(str) {
      if (str === undefined) {
        if (this._usage)
          return this._usage;
        const args = this.registeredArguments.map((arg) => {
          return humanReadableArgName(arg);
        });
        return [].concat(this.options.length || this._helpOption !== null ? "[options]" : [], this.commands.length ? "[command]" : [], this.registeredArguments.length ? args : []).join(" ");
      }
      this._usage = str;
      return this;
    }
    name(str) {
      if (str === undefined)
        return this._name;
      this._name = str;
      return this;
    }
    nameFromFilename(filename) {
      this._name = path.basename(filename, path.extname(filename));
      return this;
    }
    executableDir(path2) {
      if (path2 === undefined)
        return this._executableDir;
      this._executableDir = path2;
      return this;
    }
    helpInformation(contextOptions) {
      const helper = this.createHelp();
      if (helper.helpWidth === undefined) {
        helper.helpWidth = contextOptions && contextOptions.error ? this._outputConfiguration.getErrHelpWidth() : this._outputConfiguration.getOutHelpWidth();
      }
      return helper.formatHelp(this, helper);
    }
    _getHelpContext(contextOptions) {
      contextOptions = contextOptions || {};
      const context = { error: !!contextOptions.error };
      let write;
      if (context.error) {
        write = (arg) => this._outputConfiguration.writeErr(arg);
      } else {
        write = (arg) => this._outputConfiguration.writeOut(arg);
      }
      context.write = contextOptions.write || write;
      context.command = this;
      return context;
    }
    outputHelp(contextOptions) {
      let deprecatedCallback;
      if (typeof contextOptions === "function") {
        deprecatedCallback = contextOptions;
        contextOptions = undefined;
      }
      const context = this._getHelpContext(contextOptions);
      this._getCommandAndAncestors().reverse().forEach((command) => command.emit("beforeAllHelp", context));
      this.emit("beforeHelp", context);
      let helpInformation = this.helpInformation(context);
      if (deprecatedCallback) {
        helpInformation = deprecatedCallback(helpInformation);
        if (typeof helpInformation !== "string" && !Buffer.isBuffer(helpInformation)) {
          throw new Error("outputHelp callback must return a string or a Buffer");
        }
      }
      context.write(helpInformation);
      if (this._getHelpOption()?.long) {
        this.emit(this._getHelpOption().long);
      }
      this.emit("afterHelp", context);
      this._getCommandAndAncestors().forEach((command) => command.emit("afterAllHelp", context));
    }
    helpOption(flags, description) {
      if (typeof flags === "boolean") {
        if (flags) {
          this._helpOption = this._helpOption ?? undefined;
        } else {
          this._helpOption = null;
        }
        return this;
      }
      flags = flags ?? "-h, --help";
      description = description ?? "display help for command";
      this._helpOption = this.createOption(flags, description);
      return this;
    }
    _getHelpOption() {
      if (this._helpOption === undefined) {
        this.helpOption(undefined, undefined);
      }
      return this._helpOption;
    }
    addHelpOption(option) {
      this._helpOption = option;
      return this;
    }
    help(contextOptions) {
      this.outputHelp(contextOptions);
      let exitCode = process2.exitCode || 0;
      if (exitCode === 0 && contextOptions && typeof contextOptions !== "function" && contextOptions.error) {
        exitCode = 1;
      }
      this._exit(exitCode, "commander.help", "(outputHelp)");
    }
    addHelpText(position, text) {
      const allowedValues = ["beforeAll", "before", "after", "afterAll"];
      if (!allowedValues.includes(position)) {
        throw new Error(`Unexpected value for position to addHelpText.
Expecting one of '${allowedValues.join("', '")}'`);
      }
      const helpEvent = `${position}Help`;
      this.on(helpEvent, (context) => {
        let helpStr;
        if (typeof text === "function") {
          helpStr = text({ error: context.error, command: context.command });
        } else {
          helpStr = text;
        }
        if (helpStr) {
          context.write(`${helpStr}
`);
        }
      });
      return this;
    }
    _outputHelpIfRequested(args) {
      const helpOption = this._getHelpOption();
      const helpRequested = helpOption && args.find((arg) => helpOption.is(arg));
      if (helpRequested) {
        this.outputHelp();
        this._exit(0, "commander.helpDisplayed", "(outputHelp)");
      }
    }
  }
  function incrementNodeInspectorPort(args) {
    return args.map((arg) => {
      if (!arg.startsWith("--inspect")) {
        return arg;
      }
      let debugOption;
      let debugHost = "127.0.0.1";
      let debugPort = "9229";
      let match;
      if ((match = arg.match(/^(--inspect(-brk)?)$/)) !== null) {
        debugOption = match[1];
      } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+)$/)) !== null) {
        debugOption = match[1];
        if (/^\d+$/.test(match[3])) {
          debugPort = match[3];
        } else {
          debugHost = match[3];
        }
      } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+):(\d+)$/)) !== null) {
        debugOption = match[1];
        debugHost = match[3];
        debugPort = match[4];
      }
      if (debugOption && debugPort !== "0") {
        return `${debugOption}=${debugHost}:${parseInt(debugPort) + 1}`;
      }
      return arg;
    });
  }
  exports.Command = Command;
});

// node_modules/commander/index.js
var require_commander = __commonJS((exports) => {
  var { Argument } = require_argument();
  var { Command } = require_command();
  var { CommanderError, InvalidArgumentError } = require_error();
  var { Help } = require_help();
  var { Option } = require_option();
  exports.program = new Command;
  exports.createCommand = (name) => new Command(name);
  exports.createOption = (flags, description) => new Option(flags, description);
  exports.createArgument = (name, description) => new Argument(name, description);
  exports.Command = Command;
  exports.Option = Option;
  exports.Argument = Argument;
  exports.Help = Help;
  exports.CommanderError = CommanderError;
  exports.InvalidArgumentError = InvalidArgumentError;
  exports.InvalidOptionArgumentError = InvalidArgumentError;
});

// node_modules/graceful-fs/polyfills.js
var require_polyfills = __commonJS((exports, module) => {
  var constants = __require("constants");
  var origCwd = process.cwd;
  var cwd = null;
  var platform = process.env.GRACEFUL_FS_PLATFORM || process.platform;
  process.cwd = function() {
    if (!cwd)
      cwd = origCwd.call(process);
    return cwd;
  };
  try {
    process.cwd();
  } catch (er) {}
  if (typeof process.chdir === "function") {
    chdir = process.chdir;
    process.chdir = function(d) {
      cwd = null;
      chdir.call(process, d);
    };
    if (Object.setPrototypeOf)
      Object.setPrototypeOf(process.chdir, chdir);
  }
  var chdir;
  module.exports = patch;
  function patch(fs) {
    if (constants.hasOwnProperty("O_SYMLINK") && process.version.match(/^v0\.6\.[0-2]|^v0\.5\./)) {
      patchLchmod(fs);
    }
    if (!fs.lutimes) {
      patchLutimes(fs);
    }
    fs.chown = chownFix(fs.chown);
    fs.fchown = chownFix(fs.fchown);
    fs.lchown = chownFix(fs.lchown);
    fs.chmod = chmodFix(fs.chmod);
    fs.fchmod = chmodFix(fs.fchmod);
    fs.lchmod = chmodFix(fs.lchmod);
    fs.chownSync = chownFixSync(fs.chownSync);
    fs.fchownSync = chownFixSync(fs.fchownSync);
    fs.lchownSync = chownFixSync(fs.lchownSync);
    fs.chmodSync = chmodFixSync(fs.chmodSync);
    fs.fchmodSync = chmodFixSync(fs.fchmodSync);
    fs.lchmodSync = chmodFixSync(fs.lchmodSync);
    fs.stat = statFix(fs.stat);
    fs.fstat = statFix(fs.fstat);
    fs.lstat = statFix(fs.lstat);
    fs.statSync = statFixSync(fs.statSync);
    fs.fstatSync = statFixSync(fs.fstatSync);
    fs.lstatSync = statFixSync(fs.lstatSync);
    if (fs.chmod && !fs.lchmod) {
      fs.lchmod = function(path, mode, cb) {
        if (cb)
          process.nextTick(cb);
      };
      fs.lchmodSync = function() {};
    }
    if (fs.chown && !fs.lchown) {
      fs.lchown = function(path, uid, gid, cb) {
        if (cb)
          process.nextTick(cb);
      };
      fs.lchownSync = function() {};
    }
    if (platform === "win32") {
      fs.rename = typeof fs.rename !== "function" ? fs.rename : function(fs$rename) {
        function rename(from, to, cb) {
          var start = Date.now();
          var backoff = 0;
          fs$rename(from, to, function CB(er) {
            if (er && (er.code === "EACCES" || er.code === "EPERM" || er.code === "EBUSY") && Date.now() - start < 60000) {
              setTimeout(function() {
                fs.stat(to, function(stater, st) {
                  if (stater && stater.code === "ENOENT")
                    fs$rename(from, to, CB);
                  else
                    cb(er);
                });
              }, backoff);
              if (backoff < 100)
                backoff += 10;
              return;
            }
            if (cb)
              cb(er);
          });
        }
        if (Object.setPrototypeOf)
          Object.setPrototypeOf(rename, fs$rename);
        return rename;
      }(fs.rename);
    }
    fs.read = typeof fs.read !== "function" ? fs.read : function(fs$read) {
      function read(fd, buffer, offset, length, position, callback_) {
        var callback;
        if (callback_ && typeof callback_ === "function") {
          var eagCounter = 0;
          callback = function(er, _, __) {
            if (er && er.code === "EAGAIN" && eagCounter < 10) {
              eagCounter++;
              return fs$read.call(fs, fd, buffer, offset, length, position, callback);
            }
            callback_.apply(this, arguments);
          };
        }
        return fs$read.call(fs, fd, buffer, offset, length, position, callback);
      }
      if (Object.setPrototypeOf)
        Object.setPrototypeOf(read, fs$read);
      return read;
    }(fs.read);
    fs.readSync = typeof fs.readSync !== "function" ? fs.readSync : function(fs$readSync) {
      return function(fd, buffer, offset, length, position) {
        var eagCounter = 0;
        while (true) {
          try {
            return fs$readSync.call(fs, fd, buffer, offset, length, position);
          } catch (er) {
            if (er.code === "EAGAIN" && eagCounter < 10) {
              eagCounter++;
              continue;
            }
            throw er;
          }
        }
      };
    }(fs.readSync);
    function patchLchmod(fs2) {
      fs2.lchmod = function(path, mode, callback) {
        fs2.open(path, constants.O_WRONLY | constants.O_SYMLINK, mode, function(err, fd) {
          if (err) {
            if (callback)
              callback(err);
            return;
          }
          fs2.fchmod(fd, mode, function(err2) {
            fs2.close(fd, function(err22) {
              if (callback)
                callback(err2 || err22);
            });
          });
        });
      };
      fs2.lchmodSync = function(path, mode) {
        var fd = fs2.openSync(path, constants.O_WRONLY | constants.O_SYMLINK, mode);
        var threw = true;
        var ret;
        try {
          ret = fs2.fchmodSync(fd, mode);
          threw = false;
        } finally {
          if (threw) {
            try {
              fs2.closeSync(fd);
            } catch (er) {}
          } else {
            fs2.closeSync(fd);
          }
        }
        return ret;
      };
    }
    function patchLutimes(fs2) {
      if (constants.hasOwnProperty("O_SYMLINK") && fs2.futimes) {
        fs2.lutimes = function(path, at, mt, cb) {
          fs2.open(path, constants.O_SYMLINK, function(er, fd) {
            if (er) {
              if (cb)
                cb(er);
              return;
            }
            fs2.futimes(fd, at, mt, function(er2) {
              fs2.close(fd, function(er22) {
                if (cb)
                  cb(er2 || er22);
              });
            });
          });
        };
        fs2.lutimesSync = function(path, at, mt) {
          var fd = fs2.openSync(path, constants.O_SYMLINK);
          var ret;
          var threw = true;
          try {
            ret = fs2.futimesSync(fd, at, mt);
            threw = false;
          } finally {
            if (threw) {
              try {
                fs2.closeSync(fd);
              } catch (er) {}
            } else {
              fs2.closeSync(fd);
            }
          }
          return ret;
        };
      } else if (fs2.futimes) {
        fs2.lutimes = function(_a, _b, _c, cb) {
          if (cb)
            process.nextTick(cb);
        };
        fs2.lutimesSync = function() {};
      }
    }
    function chmodFix(orig) {
      if (!orig)
        return orig;
      return function(target, mode, cb) {
        return orig.call(fs, target, mode, function(er) {
          if (chownErOk(er))
            er = null;
          if (cb)
            cb.apply(this, arguments);
        });
      };
    }
    function chmodFixSync(orig) {
      if (!orig)
        return orig;
      return function(target, mode) {
        try {
          return orig.call(fs, target, mode);
        } catch (er) {
          if (!chownErOk(er))
            throw er;
        }
      };
    }
    function chownFix(orig) {
      if (!orig)
        return orig;
      return function(target, uid, gid, cb) {
        return orig.call(fs, target, uid, gid, function(er) {
          if (chownErOk(er))
            er = null;
          if (cb)
            cb.apply(this, arguments);
        });
      };
    }
    function chownFixSync(orig) {
      if (!orig)
        return orig;
      return function(target, uid, gid) {
        try {
          return orig.call(fs, target, uid, gid);
        } catch (er) {
          if (!chownErOk(er))
            throw er;
        }
      };
    }
    function statFix(orig) {
      if (!orig)
        return orig;
      return function(target, options, cb) {
        if (typeof options === "function") {
          cb = options;
          options = null;
        }
        function callback(er, stats) {
          if (stats) {
            if (stats.uid < 0)
              stats.uid += 4294967296;
            if (stats.gid < 0)
              stats.gid += 4294967296;
          }
          if (cb)
            cb.apply(this, arguments);
        }
        return options ? orig.call(fs, target, options, callback) : orig.call(fs, target, callback);
      };
    }
    function statFixSync(orig) {
      if (!orig)
        return orig;
      return function(target, options) {
        var stats = options ? orig.call(fs, target, options) : orig.call(fs, target);
        if (stats) {
          if (stats.uid < 0)
            stats.uid += 4294967296;
          if (stats.gid < 0)
            stats.gid += 4294967296;
        }
        return stats;
      };
    }
    function chownErOk(er) {
      if (!er)
        return true;
      if (er.code === "ENOSYS")
        return true;
      var nonroot = !process.getuid || process.getuid() !== 0;
      if (nonroot) {
        if (er.code === "EINVAL" || er.code === "EPERM")
          return true;
      }
      return false;
    }
  }
});

// node_modules/graceful-fs/legacy-streams.js
var require_legacy_streams = __commonJS((exports, module) => {
  var Stream = __require("stream").Stream;
  module.exports = legacy;
  function legacy(fs) {
    return {
      ReadStream,
      WriteStream
    };
    function ReadStream(path, options) {
      if (!(this instanceof ReadStream))
        return new ReadStream(path, options);
      Stream.call(this);
      var self = this;
      this.path = path;
      this.fd = null;
      this.readable = true;
      this.paused = false;
      this.flags = "r";
      this.mode = 438;
      this.bufferSize = 64 * 1024;
      options = options || {};
      var keys = Object.keys(options);
      for (var index = 0, length = keys.length;index < length; index++) {
        var key = keys[index];
        this[key] = options[key];
      }
      if (this.encoding)
        this.setEncoding(this.encoding);
      if (this.start !== undefined) {
        if (typeof this.start !== "number") {
          throw TypeError("start must be a Number");
        }
        if (this.end === undefined) {
          this.end = Infinity;
        } else if (typeof this.end !== "number") {
          throw TypeError("end must be a Number");
        }
        if (this.start > this.end) {
          throw new Error("start must be <= end");
        }
        this.pos = this.start;
      }
      if (this.fd !== null) {
        process.nextTick(function() {
          self._read();
        });
        return;
      }
      fs.open(this.path, this.flags, this.mode, function(err, fd) {
        if (err) {
          self.emit("error", err);
          self.readable = false;
          return;
        }
        self.fd = fd;
        self.emit("open", fd);
        self._read();
      });
    }
    function WriteStream(path, options) {
      if (!(this instanceof WriteStream))
        return new WriteStream(path, options);
      Stream.call(this);
      this.path = path;
      this.fd = null;
      this.writable = true;
      this.flags = "w";
      this.encoding = "binary";
      this.mode = 438;
      this.bytesWritten = 0;
      options = options || {};
      var keys = Object.keys(options);
      for (var index = 0, length = keys.length;index < length; index++) {
        var key = keys[index];
        this[key] = options[key];
      }
      if (this.start !== undefined) {
        if (typeof this.start !== "number") {
          throw TypeError("start must be a Number");
        }
        if (this.start < 0) {
          throw new Error("start must be >= zero");
        }
        this.pos = this.start;
      }
      this.busy = false;
      this._queue = [];
      if (this.fd === null) {
        this._open = fs.open;
        this._queue.push([this._open, this.path, this.flags, this.mode, undefined]);
        this.flush();
      }
    }
  }
});

// node_modules/graceful-fs/clone.js
var require_clone = __commonJS((exports, module) => {
  module.exports = clone;
  var getPrototypeOf = Object.getPrototypeOf || function(obj) {
    return obj.__proto__;
  };
  function clone(obj) {
    if (obj === null || typeof obj !== "object")
      return obj;
    if (obj instanceof Object)
      var copy = { __proto__: getPrototypeOf(obj) };
    else
      var copy = Object.create(null);
    Object.getOwnPropertyNames(obj).forEach(function(key) {
      Object.defineProperty(copy, key, Object.getOwnPropertyDescriptor(obj, key));
    });
    return copy;
  }
});

// node_modules/graceful-fs/graceful-fs.js
var require_graceful_fs = __commonJS((exports, module) => {
  var fs = __require("fs");
  var polyfills = require_polyfills();
  var legacy = require_legacy_streams();
  var clone = require_clone();
  var util = __require("util");
  var gracefulQueue;
  var previousSymbol;
  if (typeof Symbol === "function" && typeof Symbol.for === "function") {
    gracefulQueue = Symbol.for("graceful-fs.queue");
    previousSymbol = Symbol.for("graceful-fs.previous");
  } else {
    gracefulQueue = "___graceful-fs.queue";
    previousSymbol = "___graceful-fs.previous";
  }
  function noop() {}
  function publishQueue(context, queue2) {
    Object.defineProperty(context, gracefulQueue, {
      get: function() {
        return queue2;
      }
    });
  }
  var debug = noop;
  if (util.debuglog)
    debug = util.debuglog("gfs4");
  else if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || ""))
    debug = function() {
      var m = util.format.apply(util, arguments);
      m = "GFS4: " + m.split(/\n/).join(`
GFS4: `);
      console.error(m);
    };
  if (!fs[gracefulQueue]) {
    queue = global[gracefulQueue] || [];
    publishQueue(fs, queue);
    fs.close = function(fs$close) {
      function close(fd, cb) {
        return fs$close.call(fs, fd, function(err) {
          if (!err) {
            resetQueue();
          }
          if (typeof cb === "function")
            cb.apply(this, arguments);
        });
      }
      Object.defineProperty(close, previousSymbol, {
        value: fs$close
      });
      return close;
    }(fs.close);
    fs.closeSync = function(fs$closeSync) {
      function closeSync(fd) {
        fs$closeSync.apply(fs, arguments);
        resetQueue();
      }
      Object.defineProperty(closeSync, previousSymbol, {
        value: fs$closeSync
      });
      return closeSync;
    }(fs.closeSync);
    if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || "")) {
      process.on("exit", function() {
        debug(fs[gracefulQueue]);
        __require("assert").equal(fs[gracefulQueue].length, 0);
      });
    }
  }
  var queue;
  if (!global[gracefulQueue]) {
    publishQueue(global, fs[gracefulQueue]);
  }
  module.exports = patch(clone(fs));
  if (process.env.TEST_GRACEFUL_FS_GLOBAL_PATCH && !fs.__patched) {
    module.exports = patch(fs);
    fs.__patched = true;
  }
  function patch(fs2) {
    polyfills(fs2);
    fs2.gracefulify = patch;
    fs2.createReadStream = createReadStream;
    fs2.createWriteStream = createWriteStream;
    var fs$readFile = fs2.readFile;
    fs2.readFile = readFile;
    function readFile(path, options, cb) {
      if (typeof options === "function")
        cb = options, options = null;
      return go$readFile(path, options, cb);
      function go$readFile(path2, options2, cb2, startTime) {
        return fs$readFile(path2, options2, function(err) {
          if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
            enqueue([go$readFile, [path2, options2, cb2], err, startTime || Date.now(), Date.now()]);
          else {
            if (typeof cb2 === "function")
              cb2.apply(this, arguments);
          }
        });
      }
    }
    var fs$writeFile = fs2.writeFile;
    fs2.writeFile = writeFile;
    function writeFile(path, data, options, cb) {
      if (typeof options === "function")
        cb = options, options = null;
      return go$writeFile(path, data, options, cb);
      function go$writeFile(path2, data2, options2, cb2, startTime) {
        return fs$writeFile(path2, data2, options2, function(err) {
          if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
            enqueue([go$writeFile, [path2, data2, options2, cb2], err, startTime || Date.now(), Date.now()]);
          else {
            if (typeof cb2 === "function")
              cb2.apply(this, arguments);
          }
        });
      }
    }
    var fs$appendFile = fs2.appendFile;
    if (fs$appendFile)
      fs2.appendFile = appendFile;
    function appendFile(path, data, options, cb) {
      if (typeof options === "function")
        cb = options, options = null;
      return go$appendFile(path, data, options, cb);
      function go$appendFile(path2, data2, options2, cb2, startTime) {
        return fs$appendFile(path2, data2, options2, function(err) {
          if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
            enqueue([go$appendFile, [path2, data2, options2, cb2], err, startTime || Date.now(), Date.now()]);
          else {
            if (typeof cb2 === "function")
              cb2.apply(this, arguments);
          }
        });
      }
    }
    var fs$copyFile = fs2.copyFile;
    if (fs$copyFile)
      fs2.copyFile = copyFile;
    function copyFile(src, dest, flags, cb) {
      if (typeof flags === "function") {
        cb = flags;
        flags = 0;
      }
      return go$copyFile(src, dest, flags, cb);
      function go$copyFile(src2, dest2, flags2, cb2, startTime) {
        return fs$copyFile(src2, dest2, flags2, function(err) {
          if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
            enqueue([go$copyFile, [src2, dest2, flags2, cb2], err, startTime || Date.now(), Date.now()]);
          else {
            if (typeof cb2 === "function")
              cb2.apply(this, arguments);
          }
        });
      }
    }
    var fs$readdir = fs2.readdir;
    fs2.readdir = readdir;
    var noReaddirOptionVersions = /^v[0-5]\./;
    function readdir(path, options, cb) {
      if (typeof options === "function")
        cb = options, options = null;
      var go$readdir = noReaddirOptionVersions.test(process.version) ? function go$readdir2(path2, options2, cb2, startTime) {
        return fs$readdir(path2, fs$readdirCallback(path2, options2, cb2, startTime));
      } : function go$readdir2(path2, options2, cb2, startTime) {
        return fs$readdir(path2, options2, fs$readdirCallback(path2, options2, cb2, startTime));
      };
      return go$readdir(path, options, cb);
      function fs$readdirCallback(path2, options2, cb2, startTime) {
        return function(err, files) {
          if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
            enqueue([
              go$readdir,
              [path2, options2, cb2],
              err,
              startTime || Date.now(),
              Date.now()
            ]);
          else {
            if (files && files.sort)
              files.sort();
            if (typeof cb2 === "function")
              cb2.call(this, err, files);
          }
        };
      }
    }
    if (process.version.substr(0, 4) === "v0.8") {
      var legStreams = legacy(fs2);
      ReadStream = legStreams.ReadStream;
      WriteStream = legStreams.WriteStream;
    }
    var fs$ReadStream = fs2.ReadStream;
    if (fs$ReadStream) {
      ReadStream.prototype = Object.create(fs$ReadStream.prototype);
      ReadStream.prototype.open = ReadStream$open;
    }
    var fs$WriteStream = fs2.WriteStream;
    if (fs$WriteStream) {
      WriteStream.prototype = Object.create(fs$WriteStream.prototype);
      WriteStream.prototype.open = WriteStream$open;
    }
    Object.defineProperty(fs2, "ReadStream", {
      get: function() {
        return ReadStream;
      },
      set: function(val) {
        ReadStream = val;
      },
      enumerable: true,
      configurable: true
    });
    Object.defineProperty(fs2, "WriteStream", {
      get: function() {
        return WriteStream;
      },
      set: function(val) {
        WriteStream = val;
      },
      enumerable: true,
      configurable: true
    });
    var FileReadStream = ReadStream;
    Object.defineProperty(fs2, "FileReadStream", {
      get: function() {
        return FileReadStream;
      },
      set: function(val) {
        FileReadStream = val;
      },
      enumerable: true,
      configurable: true
    });
    var FileWriteStream = WriteStream;
    Object.defineProperty(fs2, "FileWriteStream", {
      get: function() {
        return FileWriteStream;
      },
      set: function(val) {
        FileWriteStream = val;
      },
      enumerable: true,
      configurable: true
    });
    function ReadStream(path, options) {
      if (this instanceof ReadStream)
        return fs$ReadStream.apply(this, arguments), this;
      else
        return ReadStream.apply(Object.create(ReadStream.prototype), arguments);
    }
    function ReadStream$open() {
      var that = this;
      open(that.path, that.flags, that.mode, function(err, fd) {
        if (err) {
          if (that.autoClose)
            that.destroy();
          that.emit("error", err);
        } else {
          that.fd = fd;
          that.emit("open", fd);
          that.read();
        }
      });
    }
    function WriteStream(path, options) {
      if (this instanceof WriteStream)
        return fs$WriteStream.apply(this, arguments), this;
      else
        return WriteStream.apply(Object.create(WriteStream.prototype), arguments);
    }
    function WriteStream$open() {
      var that = this;
      open(that.path, that.flags, that.mode, function(err, fd) {
        if (err) {
          that.destroy();
          that.emit("error", err);
        } else {
          that.fd = fd;
          that.emit("open", fd);
        }
      });
    }
    function createReadStream(path, options) {
      return new fs2.ReadStream(path, options);
    }
    function createWriteStream(path, options) {
      return new fs2.WriteStream(path, options);
    }
    var fs$open = fs2.open;
    fs2.open = open;
    function open(path, flags, mode, cb) {
      if (typeof mode === "function")
        cb = mode, mode = null;
      return go$open(path, flags, mode, cb);
      function go$open(path2, flags2, mode2, cb2, startTime) {
        return fs$open(path2, flags2, mode2, function(err, fd) {
          if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
            enqueue([go$open, [path2, flags2, mode2, cb2], err, startTime || Date.now(), Date.now()]);
          else {
            if (typeof cb2 === "function")
              cb2.apply(this, arguments);
          }
        });
      }
    }
    return fs2;
  }
  function enqueue(elem) {
    debug("ENQUEUE", elem[0].name, elem[1]);
    fs[gracefulQueue].push(elem);
    retry();
  }
  var retryTimer;
  function resetQueue() {
    var now = Date.now();
    for (var i = 0;i < fs[gracefulQueue].length; ++i) {
      if (fs[gracefulQueue][i].length > 2) {
        fs[gracefulQueue][i][3] = now;
        fs[gracefulQueue][i][4] = now;
      }
    }
    retry();
  }
  function retry() {
    clearTimeout(retryTimer);
    retryTimer = undefined;
    if (fs[gracefulQueue].length === 0)
      return;
    var elem = fs[gracefulQueue].shift();
    var fn = elem[0];
    var args = elem[1];
    var err = elem[2];
    var startTime = elem[3];
    var lastTime = elem[4];
    if (startTime === undefined) {
      debug("RETRY", fn.name, args);
      fn.apply(null, args);
    } else if (Date.now() - startTime >= 60000) {
      debug("TIMEOUT", fn.name, args);
      var cb = args.pop();
      if (typeof cb === "function")
        cb.call(null, err);
    } else {
      var sinceAttempt = Date.now() - lastTime;
      var sinceStart = Math.max(lastTime - startTime, 1);
      var desiredDelay = Math.min(sinceStart * 1.2, 100);
      if (sinceAttempt >= desiredDelay) {
        debug("RETRY", fn.name, args);
        fn.apply(null, args.concat([startTime]));
      } else {
        fs[gracefulQueue].push(elem);
      }
    }
    if (retryTimer === undefined) {
      retryTimer = setTimeout(retry, 0);
    }
  }
});

// node_modules/retry/lib/retry_operation.js
var require_retry_operation = __commonJS((exports, module) => {
  function RetryOperation(timeouts, options) {
    if (typeof options === "boolean") {
      options = { forever: options };
    }
    this._originalTimeouts = JSON.parse(JSON.stringify(timeouts));
    this._timeouts = timeouts;
    this._options = options || {};
    this._maxRetryTime = options && options.maxRetryTime || Infinity;
    this._fn = null;
    this._errors = [];
    this._attempts = 1;
    this._operationTimeout = null;
    this._operationTimeoutCb = null;
    this._timeout = null;
    this._operationStart = null;
    if (this._options.forever) {
      this._cachedTimeouts = this._timeouts.slice(0);
    }
  }
  module.exports = RetryOperation;
  RetryOperation.prototype.reset = function() {
    this._attempts = 1;
    this._timeouts = this._originalTimeouts;
  };
  RetryOperation.prototype.stop = function() {
    if (this._timeout) {
      clearTimeout(this._timeout);
    }
    this._timeouts = [];
    this._cachedTimeouts = null;
  };
  RetryOperation.prototype.retry = function(err) {
    if (this._timeout) {
      clearTimeout(this._timeout);
    }
    if (!err) {
      return false;
    }
    var currentTime = new Date().getTime();
    if (err && currentTime - this._operationStart >= this._maxRetryTime) {
      this._errors.unshift(new Error("RetryOperation timeout occurred"));
      return false;
    }
    this._errors.push(err);
    var timeout = this._timeouts.shift();
    if (timeout === undefined) {
      if (this._cachedTimeouts) {
        this._errors.splice(this._errors.length - 1, this._errors.length);
        this._timeouts = this._cachedTimeouts.slice(0);
        timeout = this._timeouts.shift();
      } else {
        return false;
      }
    }
    var self = this;
    var timer = setTimeout(function() {
      self._attempts++;
      if (self._operationTimeoutCb) {
        self._timeout = setTimeout(function() {
          self._operationTimeoutCb(self._attempts);
        }, self._operationTimeout);
        if (self._options.unref) {
          self._timeout.unref();
        }
      }
      self._fn(self._attempts);
    }, timeout);
    if (this._options.unref) {
      timer.unref();
    }
    return true;
  };
  RetryOperation.prototype.attempt = function(fn, timeoutOps) {
    this._fn = fn;
    if (timeoutOps) {
      if (timeoutOps.timeout) {
        this._operationTimeout = timeoutOps.timeout;
      }
      if (timeoutOps.cb) {
        this._operationTimeoutCb = timeoutOps.cb;
      }
    }
    var self = this;
    if (this._operationTimeoutCb) {
      this._timeout = setTimeout(function() {
        self._operationTimeoutCb();
      }, self._operationTimeout);
    }
    this._operationStart = new Date().getTime();
    this._fn(this._attempts);
  };
  RetryOperation.prototype.try = function(fn) {
    console.log("Using RetryOperation.try() is deprecated");
    this.attempt(fn);
  };
  RetryOperation.prototype.start = function(fn) {
    console.log("Using RetryOperation.start() is deprecated");
    this.attempt(fn);
  };
  RetryOperation.prototype.start = RetryOperation.prototype.try;
  RetryOperation.prototype.errors = function() {
    return this._errors;
  };
  RetryOperation.prototype.attempts = function() {
    return this._attempts;
  };
  RetryOperation.prototype.mainError = function() {
    if (this._errors.length === 0) {
      return null;
    }
    var counts = {};
    var mainError = null;
    var mainErrorCount = 0;
    for (var i = 0;i < this._errors.length; i++) {
      var error = this._errors[i];
      var message = error.message;
      var count = (counts[message] || 0) + 1;
      counts[message] = count;
      if (count >= mainErrorCount) {
        mainError = error;
        mainErrorCount = count;
      }
    }
    return mainError;
  };
});

// node_modules/retry/lib/retry.js
var require_retry = __commonJS((exports) => {
  var RetryOperation = require_retry_operation();
  exports.operation = function(options) {
    var timeouts = exports.timeouts(options);
    return new RetryOperation(timeouts, {
      forever: options && options.forever,
      unref: options && options.unref,
      maxRetryTime: options && options.maxRetryTime
    });
  };
  exports.timeouts = function(options) {
    if (options instanceof Array) {
      return [].concat(options);
    }
    var opts = {
      retries: 10,
      factor: 2,
      minTimeout: 1 * 1000,
      maxTimeout: Infinity,
      randomize: false
    };
    for (var key in options) {
      opts[key] = options[key];
    }
    if (opts.minTimeout > opts.maxTimeout) {
      throw new Error("minTimeout is greater than maxTimeout");
    }
    var timeouts = [];
    for (var i = 0;i < opts.retries; i++) {
      timeouts.push(this.createTimeout(i, opts));
    }
    if (options && options.forever && !timeouts.length) {
      timeouts.push(this.createTimeout(i, opts));
    }
    timeouts.sort(function(a, b) {
      return a - b;
    });
    return timeouts;
  };
  exports.createTimeout = function(attempt, opts) {
    var random = opts.randomize ? Math.random() + 1 : 1;
    var timeout = Math.round(random * opts.minTimeout * Math.pow(opts.factor, attempt));
    timeout = Math.min(timeout, opts.maxTimeout);
    return timeout;
  };
  exports.wrap = function(obj, options, methods) {
    if (options instanceof Array) {
      methods = options;
      options = null;
    }
    if (!methods) {
      methods = [];
      for (var key in obj) {
        if (typeof obj[key] === "function") {
          methods.push(key);
        }
      }
    }
    for (var i = 0;i < methods.length; i++) {
      var method = methods[i];
      var original = obj[method];
      obj[method] = function retryWrapper(original2) {
        var op = exports.operation(options);
        var args = Array.prototype.slice.call(arguments, 1);
        var callback = args.pop();
        args.push(function(err) {
          if (op.retry(err)) {
            return;
          }
          if (err) {
            arguments[0] = op.mainError();
          }
          callback.apply(this, arguments);
        });
        op.attempt(function() {
          original2.apply(obj, args);
        });
      }.bind(obj, original);
      obj[method].options = options;
    }
  };
});

// node_modules/signal-exit/signals.js
var require_signals = __commonJS((exports, module) => {
  module.exports = [
    "SIGABRT",
    "SIGALRM",
    "SIGHUP",
    "SIGINT",
    "SIGTERM"
  ];
  if (process.platform !== "win32") {
    module.exports.push("SIGVTALRM", "SIGXCPU", "SIGXFSZ", "SIGUSR2", "SIGTRAP", "SIGSYS", "SIGQUIT", "SIGIOT");
  }
  if (process.platform === "linux") {
    module.exports.push("SIGIO", "SIGPOLL", "SIGPWR", "SIGSTKFLT", "SIGUNUSED");
  }
});

// node_modules/signal-exit/index.js
var require_signal_exit = __commonJS((exports, module) => {
  var process2 = global.process;
  var processOk = function(process3) {
    return process3 && typeof process3 === "object" && typeof process3.removeListener === "function" && typeof process3.emit === "function" && typeof process3.reallyExit === "function" && typeof process3.listeners === "function" && typeof process3.kill === "function" && typeof process3.pid === "number" && typeof process3.on === "function";
  };
  if (!processOk(process2)) {
    module.exports = function() {
      return function() {};
    };
  } else {
    assert = __require("assert");
    signals = require_signals();
    isWin = /^win/i.test(process2.platform);
    EE = __require("events");
    if (typeof EE !== "function") {
      EE = EE.EventEmitter;
    }
    if (process2.__signal_exit_emitter__) {
      emitter = process2.__signal_exit_emitter__;
    } else {
      emitter = process2.__signal_exit_emitter__ = new EE;
      emitter.count = 0;
      emitter.emitted = {};
    }
    if (!emitter.infinite) {
      emitter.setMaxListeners(Infinity);
      emitter.infinite = true;
    }
    module.exports = function(cb, opts) {
      if (!processOk(global.process)) {
        return function() {};
      }
      assert.equal(typeof cb, "function", "a callback must be provided for exit handler");
      if (loaded === false) {
        load();
      }
      var ev = "exit";
      if (opts && opts.alwaysLast) {
        ev = "afterexit";
      }
      var remove = function() {
        emitter.removeListener(ev, cb);
        if (emitter.listeners("exit").length === 0 && emitter.listeners("afterexit").length === 0) {
          unload();
        }
      };
      emitter.on(ev, cb);
      return remove;
    };
    unload = function unload2() {
      if (!loaded || !processOk(global.process)) {
        return;
      }
      loaded = false;
      signals.forEach(function(sig) {
        try {
          process2.removeListener(sig, sigListeners[sig]);
        } catch (er) {}
      });
      process2.emit = originalProcessEmit;
      process2.reallyExit = originalProcessReallyExit;
      emitter.count -= 1;
    };
    module.exports.unload = unload;
    emit = function emit2(event, code, signal) {
      if (emitter.emitted[event]) {
        return;
      }
      emitter.emitted[event] = true;
      emitter.emit(event, code, signal);
    };
    sigListeners = {};
    signals.forEach(function(sig) {
      sigListeners[sig] = function listener() {
        if (!processOk(global.process)) {
          return;
        }
        var listeners = process2.listeners(sig);
        if (listeners.length === emitter.count) {
          unload();
          emit("exit", null, sig);
          emit("afterexit", null, sig);
          if (isWin && sig === "SIGHUP") {
            sig = "SIGINT";
          }
          process2.kill(process2.pid, sig);
        }
      };
    });
    module.exports.signals = function() {
      return signals;
    };
    loaded = false;
    load = function load2() {
      if (loaded || !processOk(global.process)) {
        return;
      }
      loaded = true;
      emitter.count += 1;
      signals = signals.filter(function(sig) {
        try {
          process2.on(sig, sigListeners[sig]);
          return true;
        } catch (er) {
          return false;
        }
      });
      process2.emit = processEmit;
      process2.reallyExit = processReallyExit;
    };
    module.exports.load = load;
    originalProcessReallyExit = process2.reallyExit;
    processReallyExit = function processReallyExit2(code) {
      if (!processOk(global.process)) {
        return;
      }
      process2.exitCode = code || 0;
      emit("exit", process2.exitCode, null);
      emit("afterexit", process2.exitCode, null);
      originalProcessReallyExit.call(process2, process2.exitCode);
    };
    originalProcessEmit = process2.emit;
    processEmit = function processEmit2(ev, arg) {
      if (ev === "exit" && processOk(global.process)) {
        if (arg !== undefined) {
          process2.exitCode = arg;
        }
        var ret = originalProcessEmit.apply(this, arguments);
        emit("exit", process2.exitCode, null);
        emit("afterexit", process2.exitCode, null);
        return ret;
      } else {
        return originalProcessEmit.apply(this, arguments);
      }
    };
  }
  var assert;
  var signals;
  var isWin;
  var EE;
  var emitter;
  var unload;
  var emit;
  var sigListeners;
  var loaded;
  var load;
  var originalProcessReallyExit;
  var processReallyExit;
  var originalProcessEmit;
  var processEmit;
});

// node_modules/proper-lockfile/lib/mtime-precision.js
var require_mtime_precision = __commonJS((exports, module) => {
  var cacheSymbol = Symbol();
  function probe(file, fs, callback) {
    const cachedPrecision = fs[cacheSymbol];
    if (cachedPrecision) {
      return fs.stat(file, (err, stat) => {
        if (err) {
          return callback(err);
        }
        callback(null, stat.mtime, cachedPrecision);
      });
    }
    const mtime = new Date(Math.ceil(Date.now() / 1000) * 1000 + 5);
    fs.utimes(file, mtime, mtime, (err) => {
      if (err) {
        return callback(err);
      }
      fs.stat(file, (err2, stat) => {
        if (err2) {
          return callback(err2);
        }
        const precision = stat.mtime.getTime() % 1000 === 0 ? "s" : "ms";
        Object.defineProperty(fs, cacheSymbol, { value: precision });
        callback(null, stat.mtime, precision);
      });
    });
  }
  function getMtime(precision) {
    let now = Date.now();
    if (precision === "s") {
      now = Math.ceil(now / 1000) * 1000;
    }
    return new Date(now);
  }
  exports.probe = probe;
  exports.getMtime = getMtime;
});

// node_modules/proper-lockfile/lib/lockfile.js
var require_lockfile = __commonJS((exports, module) => {
  var path = __require("path");
  var fs = require_graceful_fs();
  var retry = require_retry();
  var onExit = require_signal_exit();
  var mtimePrecision = require_mtime_precision();
  var locks = {};
  function getLockFile(file, options) {
    return options.lockfilePath || `${file}.lock`;
  }
  function resolveCanonicalPath(file, options, callback) {
    if (!options.realpath) {
      return callback(null, path.resolve(file));
    }
    options.fs.realpath(file, callback);
  }
  function acquireLock(file, options, callback) {
    const lockfilePath = getLockFile(file, options);
    options.fs.mkdir(lockfilePath, (err) => {
      if (!err) {
        return mtimePrecision.probe(lockfilePath, options.fs, (err2, mtime, mtimePrecision2) => {
          if (err2) {
            options.fs.rmdir(lockfilePath, () => {});
            return callback(err2);
          }
          callback(null, mtime, mtimePrecision2);
        });
      }
      if (err.code !== "EEXIST") {
        return callback(err);
      }
      if (options.stale <= 0) {
        return callback(Object.assign(new Error("Lock file is already being held"), { code: "ELOCKED", file }));
      }
      options.fs.stat(lockfilePath, (err2, stat) => {
        if (err2) {
          if (err2.code === "ENOENT") {
            return acquireLock(file, { ...options, stale: 0 }, callback);
          }
          return callback(err2);
        }
        if (!isLockStale(stat, options)) {
          return callback(Object.assign(new Error("Lock file is already being held"), { code: "ELOCKED", file }));
        }
        removeLock(file, options, (err3) => {
          if (err3) {
            return callback(err3);
          }
          acquireLock(file, { ...options, stale: 0 }, callback);
        });
      });
    });
  }
  function isLockStale(stat, options) {
    return stat.mtime.getTime() < Date.now() - options.stale;
  }
  function removeLock(file, options, callback) {
    options.fs.rmdir(getLockFile(file, options), (err) => {
      if (err && err.code !== "ENOENT") {
        return callback(err);
      }
      callback();
    });
  }
  function updateLock(file, options) {
    const lock2 = locks[file];
    if (lock2.updateTimeout) {
      return;
    }
    lock2.updateDelay = lock2.updateDelay || options.update;
    lock2.updateTimeout = setTimeout(() => {
      lock2.updateTimeout = null;
      options.fs.stat(lock2.lockfilePath, (err, stat) => {
        const isOverThreshold = lock2.lastUpdate + options.stale < Date.now();
        if (err) {
          if (err.code === "ENOENT" || isOverThreshold) {
            return setLockAsCompromised(file, lock2, Object.assign(err, { code: "ECOMPROMISED" }));
          }
          lock2.updateDelay = 1000;
          return updateLock(file, options);
        }
        const isMtimeOurs = lock2.mtime.getTime() === stat.mtime.getTime();
        if (!isMtimeOurs) {
          return setLockAsCompromised(file, lock2, Object.assign(new Error("Unable to update lock within the stale threshold"), { code: "ECOMPROMISED" }));
        }
        const mtime = mtimePrecision.getMtime(lock2.mtimePrecision);
        options.fs.utimes(lock2.lockfilePath, mtime, mtime, (err2) => {
          const isOverThreshold2 = lock2.lastUpdate + options.stale < Date.now();
          if (lock2.released) {
            return;
          }
          if (err2) {
            if (err2.code === "ENOENT" || isOverThreshold2) {
              return setLockAsCompromised(file, lock2, Object.assign(err2, { code: "ECOMPROMISED" }));
            }
            lock2.updateDelay = 1000;
            return updateLock(file, options);
          }
          lock2.mtime = mtime;
          lock2.lastUpdate = Date.now();
          lock2.updateDelay = null;
          updateLock(file, options);
        });
      });
    }, lock2.updateDelay);
    if (lock2.updateTimeout.unref) {
      lock2.updateTimeout.unref();
    }
  }
  function setLockAsCompromised(file, lock2, err) {
    lock2.released = true;
    if (lock2.updateTimeout) {
      clearTimeout(lock2.updateTimeout);
    }
    if (locks[file] === lock2) {
      delete locks[file];
    }
    lock2.options.onCompromised(err);
  }
  function lock(file, options, callback) {
    options = {
      stale: 1e4,
      update: null,
      realpath: true,
      retries: 0,
      fs,
      onCompromised: (err) => {
        throw err;
      },
      ...options
    };
    options.retries = options.retries || 0;
    options.retries = typeof options.retries === "number" ? { retries: options.retries } : options.retries;
    options.stale = Math.max(options.stale || 0, 2000);
    options.update = options.update == null ? options.stale / 2 : options.update || 0;
    options.update = Math.max(Math.min(options.update, options.stale / 2), 1000);
    resolveCanonicalPath(file, options, (err, file2) => {
      if (err) {
        return callback(err);
      }
      const operation = retry.operation(options.retries);
      operation.attempt(() => {
        acquireLock(file2, options, (err2, mtime, mtimePrecision2) => {
          if (operation.retry(err2)) {
            return;
          }
          if (err2) {
            return callback(operation.mainError());
          }
          const lock2 = locks[file2] = {
            lockfilePath: getLockFile(file2, options),
            mtime,
            mtimePrecision: mtimePrecision2,
            options,
            lastUpdate: Date.now()
          };
          updateLock(file2, options);
          callback(null, (releasedCallback) => {
            if (lock2.released) {
              return releasedCallback && releasedCallback(Object.assign(new Error("Lock is already released"), { code: "ERELEASED" }));
            }
            unlock(file2, { ...options, realpath: false }, releasedCallback);
          });
        });
      });
    });
  }
  function unlock(file, options, callback) {
    options = {
      fs,
      realpath: true,
      ...options
    };
    resolveCanonicalPath(file, options, (err, file2) => {
      if (err) {
        return callback(err);
      }
      const lock2 = locks[file2];
      if (!lock2) {
        return callback(Object.assign(new Error("Lock is not acquired/owned by you"), { code: "ENOTACQUIRED" }));
      }
      lock2.updateTimeout && clearTimeout(lock2.updateTimeout);
      lock2.released = true;
      delete locks[file2];
      removeLock(file2, options, callback);
    });
  }
  function check(file, options, callback) {
    options = {
      stale: 1e4,
      realpath: true,
      fs,
      ...options
    };
    options.stale = Math.max(options.stale || 0, 2000);
    resolveCanonicalPath(file, options, (err, file2) => {
      if (err) {
        return callback(err);
      }
      options.fs.stat(getLockFile(file2, options), (err2, stat) => {
        if (err2) {
          return err2.code === "ENOENT" ? callback(null, false) : callback(err2);
        }
        return callback(null, !isLockStale(stat, options));
      });
    });
  }
  function getLocks() {
    return locks;
  }
  onExit(() => {
    for (const file in locks) {
      const options = locks[file].options;
      try {
        options.fs.rmdirSync(getLockFile(file, options));
      } catch (e) {}
    }
  });
  exports.lock = lock;
  exports.unlock = unlock;
  exports.check = check;
  exports.getLocks = getLocks;
});

// node_modules/proper-lockfile/lib/adapter.js
var require_adapter = __commonJS((exports, module) => {
  var fs = require_graceful_fs();
  function createSyncFs(fs2) {
    const methods = ["mkdir", "realpath", "stat", "rmdir", "utimes"];
    const newFs = { ...fs2 };
    methods.forEach((method) => {
      newFs[method] = (...args) => {
        const callback = args.pop();
        let ret;
        try {
          ret = fs2[`${method}Sync`](...args);
        } catch (err) {
          return callback(err);
        }
        callback(null, ret);
      };
    });
    return newFs;
  }
  function toPromise(method) {
    return (...args) => new Promise((resolve, reject) => {
      args.push((err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
      method(...args);
    });
  }
  function toSync(method) {
    return (...args) => {
      let err;
      let result;
      args.push((_err, _result) => {
        err = _err;
        result = _result;
      });
      method(...args);
      if (err) {
        throw err;
      }
      return result;
    };
  }
  function toSyncOptions(options) {
    options = { ...options };
    options.fs = createSyncFs(options.fs || fs);
    if (typeof options.retries === "number" && options.retries > 0 || options.retries && typeof options.retries.retries === "number" && options.retries.retries > 0) {
      throw Object.assign(new Error("Cannot use retries with the sync api"), { code: "ESYNC" });
    }
    return options;
  }
  module.exports = {
    toPromise,
    toSync,
    toSyncOptions
  };
});

// node_modules/proper-lockfile/index.js
var require_proper_lockfile = __commonJS((exports, module) => {
  var lockfile = require_lockfile();
  var { toPromise, toSync, toSyncOptions } = require_adapter();
  async function lock(file, options) {
    const release = await toPromise(lockfile.lock)(file, options);
    return toPromise(release);
  }
  function lockSync(file, options) {
    const release = toSync(lockfile.lock)(file, toSyncOptions(options));
    return toSync(release);
  }
  function unlock(file, options) {
    return toPromise(lockfile.unlock)(file, options);
  }
  function unlockSync(file, options) {
    return toSync(lockfile.unlock)(file, toSyncOptions(options));
  }
  function check(file, options) {
    return toPromise(lockfile.check)(file, options);
  }
  function checkSync(file, options) {
    return toSync(lockfile.check)(file, toSyncOptions(options));
  }
  module.exports = lock;
  module.exports.lock = lock;
  module.exports.unlock = unlock;
  module.exports.lockSync = lockSync;
  module.exports.unlockSync = unlockSync;
  module.exports.check = check;
  module.exports.checkSync = checkSync;
});

// node_modules/commander/esm.mjs
var import__ = __toESM(require_commander(), 1);
var {
  program,
  createCommand,
  createArgument,
  createOption,
  CommanderError,
  InvalidArgumentError,
  InvalidOptionArgumentError,
  Command,
  Argument,
  Option,
  Help
} = import__.default;

// src/audit.ts
var import_proper_lockfile = __toESM(require_proper_lockfile(), 1);
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { appendFile, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";

// src/_url.ts
var SECRET_KEYS = new Set([
  "token",
  "tokens",
  "access_token",
  "id_token",
  "refresh_token",
  "auth",
  "authkey",
  "apikey",
  "api_key",
  "api-key",
  "x-api-key",
  "key",
  "secret",
  "client_secret",
  "sig",
  "signature",
  "hmac",
  "session",
  "sessionid",
  "password",
  "passwd",
  "pwd"
].map((s) => s.toLowerCase()));
var TRACKING_KEYS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "fbclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "_hsenc",
  "_hsmi"
].map((s) => s.toLowerCase()));
function redactUrl(url) {
  if (!url || !url.includes("://"))
    return url;
  let u;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  if (!u.search)
    return url;
  let mutated = false;
  for (const k of Array.from(u.searchParams.keys())) {
    if (SECRET_KEYS.has(k.toLowerCase())) {
      u.searchParams.set(k, "***");
      mutated = true;
    }
  }
  return mutated ? u.toString() : url;
}
function normalizeUrl(url, opts = {}) {
  const dropTracking = opts.dropTracking ?? true;
  if (!url || !url.includes("://"))
    return url;
  let u;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  u.hash = "";
  u.username = "";
  u.password = "";
  if (dropTracking) {
    for (const k of Array.from(u.searchParams.keys())) {
      if (TRACKING_KEYS.has(k.toLowerCase()))
        u.searchParams.delete(k);
    }
  }
  const entries = Array.from(u.searchParams.entries()).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  u.search = "";
  for (const [k, v] of entries)
    u.searchParams.append(k, v);
  return `${u.protocol.toLowerCase()}//${u.host.toLowerCase()}${u.pathname}${u.search}`;
}

// src/audit.ts
var ROTATE_BYTES = 50 * 1024 * 1024;
function stateDir() {
  return process.env.WSC_STATE_DIR ?? resolve(homedir(), ".local/state/wsc");
}
function auditPath() {
  return resolve(stateDir(), "audit.jsonl");
}
function utcIso(ts) {
  return new Date(ts ?? Date.now()).toISOString();
}
function queryFingerprint(query) {
  if (!query)
    return { query_hash: "", query_preview: "" };
  const h = createHash("sha256").update(query, "utf8").digest("hex");
  return { query_hash: h, query_preview: query.slice(0, 80) };
}
function walkRedact(value) {
  if (Array.isArray(value))
    return value.map(walkRedact);
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "url" || k === "source_url" || k === "next_url") {
        out[k] = typeof v === "string" ? redactUrl(v) : v;
      } else if (k === "urls" || k === "selected_urls") {
        out[k] = Array.isArray(v) ? v.map((u) => typeof u === "string" ? redactUrl(u) : u) : v;
      } else {
        out[k] = walkRedact(v);
      }
    }
    return out;
  }
  return value;
}
async function maybeRotate(path) {
  if (!existsSync(path))
    return;
  let size;
  try {
    size = statSync(path).size;
  } catch {
    return;
  }
  if (size < ROTATE_BYTES)
    return;
  const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rotated = resolve(dirname(path), `audit-${yyyymmdd}.jsonl.gz`);
  const src = createReadStream(path);
  const gzip = createGzip();
  const dst = createWriteStream(rotated, { flags: "a" });
  await pipeline(src, gzip, dst);
  unlinkSync(path);
}
function ensureDir(path) {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
async function record(event) {
  const path = auditPath();
  ensureDir(path);
  await maybeRotate(path);
  const payload = {
    ts: utcIso(),
    call_id: event.call_id ?? randomUUID(),
    op: event.op ?? "unknown",
    ...event
  };
  const redacted = walkRedact(payload);
  const line = JSON.stringify(redacted, sortKeysReplacer) + `
`;
  if (!existsSync(path)) {
    await appendFile(path, "");
  }
  let release;
  try {
    release = await import_proper_lockfile.default.lock(path, { retries: { retries: 10, minTimeout: 5, maxTimeout: 50 } });
    await appendFile(path, line, { encoding: "utf8" });
  } finally {
    if (release) {
      try {
        await release();
      } catch {}
    }
  }
}
function sortKeysReplacer(_key, value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const sorted = {};
    for (const k of Object.keys(value).sort()) {
      sorted[k] = value[k];
    }
    return sorted;
  }
  return value;
}
async function withCall(op, opts, fn) {
  const callId = randomUUID();
  const started = Date.now();
  const receipt = {
    call_id: callId,
    parent_call_id: opts.parentCallId ?? null,
    correlation_id: opts.correlationId ?? process.env.WSC_CORRELATION_ID ?? null,
    op,
    provider: opts.provider ?? null,
    started_at: utcIso(started),
    status: "ok"
  };
  try {
    return await fn(receipt);
  } catch (err) {
    receipt.status = "error";
    if (!receipt.error) {
      receipt.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    }
    throw err;
  } finally {
    receipt.duration_ms = Date.now() - started;
    receipt.ts = utcIso();
    if (!opts.noReceipt) {
      try {
        await record(receipt);
      } catch {}
    }
  }
}
var SINCE_UNITS = { s: 1, m: 60, h: 3600, d: 86400 };
function parseSince(spec) {
  const trimmed = spec.trim().toLowerCase();
  if (!trimmed)
    throw new Error("empty --since");
  const unit = trimmed.slice(-1);
  if (!(unit in SINCE_UNITS))
    throw new Error(`unknown --since unit in ${JSON.stringify(spec)} — use s/m/h/d`);
  const n = Number.parseFloat(trimmed.slice(0, -1));
  if (Number.isNaN(n))
    throw new Error(`invalid --since value in ${JSON.stringify(spec)}`);
  const cutoff = new Date(Date.now() - Math.floor(n * SINCE_UNITS[unit]) * 1000);
  return cutoff.toISOString().slice(0, 19);
}
async function tail(opts = {}) {
  const path = auditPath();
  if (!existsSync(path)) {
    return { ok: true, operation: "receipts.tail", events: [], path, returncode: 0 };
  }
  const cutoff = opts.since ? parseSince(opts.since) : null;
  const limit = Math.max(1, Math.min(opts.lines ?? 20, 1e4));
  const text = await readFile(path, "utf8");
  const events = [];
  for (const raw of text.split(`
`)) {
    const trimmed = raw.trim();
    if (!trimmed)
      continue;
    let event;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (opts.op && !String(event.op ?? "").startsWith(opts.op))
      continue;
    if (opts.provider && event.provider !== opts.provider)
      continue;
    if (cutoff && String(event.ts ?? "") < cutoff)
      continue;
    events.push(event);
  }
  return {
    ok: true,
    operation: "receipts.tail",
    events: events.slice(-limit),
    path,
    returncode: 0
  };
}
async function summary(opts = {}) {
  const path = auditPath();
  const days = opts.days ?? 0;
  const out = {
    ok: true,
    operation: "receipts.summary",
    path,
    returncode: 0,
    scope: days <= 0 ? "all" : `last ${days}d`,
    event_count: 0,
    by_op: {},
    by_provider: {},
    by_status: {}
  };
  if (!existsSync(path))
    return out;
  const cutoff = days > 0 ? new Date(Date.now() - days * 86400 * 1000).toISOString().slice(0, 19) : null;
  const text = await readFile(path, "utf8");
  let costUnits = 0;
  let costUsd = 0;
  const byDomain = new Map;
  const multiSource = [];
  for (const raw of text.split(`
`)) {
    const trimmed = raw.trim();
    if (!trimmed)
      continue;
    let ev;
    try {
      ev = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (cutoff && String(ev.ts ?? "") < cutoff)
      continue;
    out.event_count += 1;
    const opKey = ev.op ?? "?";
    out.by_op[opKey] = (out.by_op[opKey] ?? 0) + 1;
    const providerKey = ev.provider ?? "?";
    out.by_provider[providerKey] = (out.by_provider[providerKey] ?? 0) + 1;
    const statusKey = ev.status ?? "?";
    out.by_status[statusKey] = (out.by_status[statusKey] ?? 0) + 1;
    costUnits += Number(ev.cost_units ?? 0);
    costUsd += Number(ev.cost_usd_estimated ?? 0);
    if (opts.byDomain) {
      for (const u of ev.selected_urls ?? []) {
        if (typeof u !== "string" || !u.includes("://"))
          continue;
        try {
          const host = new URL(u).hostname;
          byDomain.set(host, (byDomain.get(host) ?? 0) + 1);
        } catch {}
      }
    }
    if (opts.highConfidence) {
      const evidence = ev.multi_source_evidence;
      if (Array.isArray(evidence) && evidence.length >= 2) {
        multiSource.push({
          call_id: ev.call_id,
          providers: evidence.map((e) => e.provider),
          ts: String(ev.ts ?? "")
        });
      }
    }
  }
  if (opts.cost) {
    out.cost_units_total = round4(costUnits);
    out.cost_usd_estimated_total = round4(costUsd);
  }
  if (opts.byDomain) {
    const sorted = Array.from(byDomain.entries()).sort(([, a], [, b]) => b - a).slice(0, 50);
    out.by_domain = Object.fromEntries(sorted);
  }
  if (opts.highConfidence) {
    out.high_confidence_events = multiSource;
  }
  return out;
}
function round4(n) {
  return Math.round(n * 1e4) / 1e4;
}

// src/config.ts
import { chmodSync, existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync, writeFileSync, unlinkSync as unlinkSync2 } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { resolve as resolve2 } from "node:path";

// node_modules/smol-toml/dist/error.js
/*!
 * Copyright (c) Squirrel Chat et al., All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
function getLineColFromPtr(string, ptr) {
  let lines = string.slice(0, ptr).split(/\r\n|\n|\r/g);
  return [lines.length, lines.pop().length + 1];
}
function makeCodeBlock(string, line, column) {
  let lines = string.split(/\r\n|\n|\r/g);
  let codeblock = "";
  let numberLen = (Math.log10(line + 1) | 0) + 1;
  for (let i = line - 1;i <= line + 1; i++) {
    let l = lines[i - 1];
    if (!l)
      continue;
    codeblock += i.toString().padEnd(numberLen, " ");
    codeblock += ":  ";
    codeblock += l;
    codeblock += `
`;
    if (i === line) {
      codeblock += " ".repeat(numberLen + column + 2);
      codeblock += `^
`;
    }
  }
  return codeblock;
}

class TomlError extends Error {
  line;
  column;
  codeblock;
  constructor(message, options) {
    const [line, column] = getLineColFromPtr(options.toml, options.ptr);
    const codeblock = makeCodeBlock(options.toml, line, column);
    super(`Invalid TOML document: ${message}

${codeblock}`, options);
    this.line = line;
    this.column = column;
    this.codeblock = codeblock;
  }
}

// node_modules/smol-toml/dist/util.js
/*!
 * Copyright (c) Squirrel Chat et al., All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
function isEscaped(str, ptr) {
  let i = 0;
  while (str[ptr - ++i] === "\\")
    ;
  return --i && i % 2;
}
function indexOfNewline(str, start = 0, end = str.length) {
  let idx = str.indexOf(`
`, start);
  if (str[idx - 1] === "\r")
    idx--;
  return idx <= end ? idx : -1;
}
function skipComment(str, ptr) {
  for (let i = ptr;i < str.length; i++) {
    let c = str[i];
    if (c === `
`)
      return i;
    if (c === "\r" && str[i + 1] === `
`)
      return i + 1;
    if (c < " " && c !== "\t" || c === "") {
      throw new TomlError("control characters are not allowed in comments", {
        toml: str,
        ptr
      });
    }
  }
  return str.length;
}
function skipVoid(str, ptr, banNewLines, banComments) {
  let c;
  while (true) {
    while ((c = str[ptr]) === " " || c === "\t" || !banNewLines && (c === `
` || c === "\r" && str[ptr + 1] === `
`))
      ptr++;
    if (banComments || c !== "#")
      break;
    ptr = skipComment(str, ptr);
  }
  return ptr;
}
function skipUntil(str, ptr, sep, end, banNewLines = false) {
  if (!end) {
    ptr = indexOfNewline(str, ptr);
    return ptr < 0 ? str.length : ptr;
  }
  for (let i = ptr;i < str.length; i++) {
    let c = str[i];
    if (c === "#") {
      i = indexOfNewline(str, i);
    } else if (c === sep) {
      return i + 1;
    } else if (c === end || banNewLines && (c === `
` || c === "\r" && str[i + 1] === `
`)) {
      return i;
    }
  }
  throw new TomlError("cannot find end of structure", {
    toml: str,
    ptr
  });
}
function getStringEnd(str, seek) {
  let first = str[seek];
  let target = first === str[seek + 1] && str[seek + 1] === str[seek + 2] ? str.slice(seek, seek + 3) : first;
  seek += target.length - 1;
  do
    seek = str.indexOf(target, ++seek);
  while (seek > -1 && first !== "'" && isEscaped(str, seek));
  if (seek > -1) {
    seek += target.length;
    if (target.length > 1) {
      if (str[seek] === first)
        seek++;
      if (str[seek] === first)
        seek++;
    }
  }
  return seek;
}

// node_modules/smol-toml/dist/date.js
/*!
 * Copyright (c) Squirrel Chat et al., All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
var DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})?[T ]?(?:(\d{2}):\d{2}(?::\d{2}(?:\.\d+)?)?)?(Z|[-+]\d{2}:\d{2})?$/i;

class TomlDate extends Date {
  #hasDate = false;
  #hasTime = false;
  #offset = null;
  constructor(date) {
    let hasDate = true;
    let hasTime = true;
    let offset = "Z";
    if (typeof date === "string") {
      let match = date.match(DATE_TIME_RE);
      if (match) {
        if (!match[1]) {
          hasDate = false;
          date = `0000-01-01T${date}`;
        }
        hasTime = !!match[2];
        hasTime && date[10] === " " && (date = date.replace(" ", "T"));
        if (match[2] && +match[2] > 23) {
          date = "";
        } else {
          offset = match[3] || null;
          date = date.toUpperCase();
          if (!offset && hasTime)
            date += "Z";
        }
      } else {
        date = "";
      }
    }
    super(date);
    if (!isNaN(this.getTime())) {
      this.#hasDate = hasDate;
      this.#hasTime = hasTime;
      this.#offset = offset;
    }
  }
  isDateTime() {
    return this.#hasDate && this.#hasTime;
  }
  isLocal() {
    return !this.#hasDate || !this.#hasTime || !this.#offset;
  }
  isDate() {
    return this.#hasDate && !this.#hasTime;
  }
  isTime() {
    return this.#hasTime && !this.#hasDate;
  }
  isValid() {
    return this.#hasDate || this.#hasTime;
  }
  toISOString() {
    let iso = super.toISOString();
    if (this.isDate())
      return iso.slice(0, 10);
    if (this.isTime())
      return iso.slice(11, 23);
    if (this.#offset === null)
      return iso.slice(0, -1);
    if (this.#offset === "Z")
      return iso;
    let offset = +this.#offset.slice(1, 3) * 60 + +this.#offset.slice(4, 6);
    offset = this.#offset[0] === "-" ? offset : -offset;
    let offsetDate = new Date(this.getTime() - offset * 60000);
    return offsetDate.toISOString().slice(0, -1) + this.#offset;
  }
  static wrapAsOffsetDateTime(jsDate, offset = "Z") {
    let date = new TomlDate(jsDate);
    date.#offset = offset;
    return date;
  }
  static wrapAsLocalDateTime(jsDate) {
    let date = new TomlDate(jsDate);
    date.#offset = null;
    return date;
  }
  static wrapAsLocalDate(jsDate) {
    let date = new TomlDate(jsDate);
    date.#hasTime = false;
    date.#offset = null;
    return date;
  }
  static wrapAsLocalTime(jsDate) {
    let date = new TomlDate(jsDate);
    date.#hasDate = false;
    date.#offset = null;
    return date;
  }
}

// node_modules/smol-toml/dist/primitive.js
/*!
 * Copyright (c) Squirrel Chat et al., All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
var INT_REGEX = /^((0x[0-9a-fA-F](_?[0-9a-fA-F])*)|(([+-]|0[ob])?\d(_?\d)*))$/;
var FLOAT_REGEX = /^[+-]?\d(_?\d)*(\.\d(_?\d)*)?([eE][+-]?\d(_?\d)*)?$/;
var LEADING_ZERO = /^[+-]?0[0-9_]/;
var ESCAPE_REGEX = /^[0-9a-f]{2,8}$/i;
var ESC_MAP = {
  b: "\b",
  t: "\t",
  n: `
`,
  f: "\f",
  r: "\r",
  e: "\x1B",
  '"': '"',
  "\\": "\\"
};
function parseString(str, ptr = 0, endPtr = str.length) {
  let isLiteral = str[ptr] === "'";
  let isMultiline = str[ptr++] === str[ptr] && str[ptr] === str[ptr + 1];
  if (isMultiline) {
    endPtr -= 2;
    if (str[ptr += 2] === "\r")
      ptr++;
    if (str[ptr] === `
`)
      ptr++;
  }
  let tmp = 0;
  let isEscape;
  let parsed = "";
  let sliceStart = ptr;
  while (ptr < endPtr - 1) {
    let c = str[ptr++];
    if (c === `
` || c === "\r" && str[ptr] === `
`) {
      if (!isMultiline) {
        throw new TomlError("newlines are not allowed in strings", {
          toml: str,
          ptr: ptr - 1
        });
      }
    } else if (c < " " && c !== "\t" || c === "") {
      throw new TomlError("control characters are not allowed in strings", {
        toml: str,
        ptr: ptr - 1
      });
    }
    if (isEscape) {
      isEscape = false;
      if (c === "x" || c === "u" || c === "U") {
        let code = str.slice(ptr, ptr += c === "x" ? 2 : c === "u" ? 4 : 8);
        if (!ESCAPE_REGEX.test(code)) {
          throw new TomlError("invalid unicode escape", {
            toml: str,
            ptr: tmp
          });
        }
        try {
          parsed += String.fromCodePoint(parseInt(code, 16));
        } catch {
          throw new TomlError("invalid unicode escape", {
            toml: str,
            ptr: tmp
          });
        }
      } else if (isMultiline && (c === `
` || c === " " || c === "\t" || c === "\r")) {
        ptr = skipVoid(str, ptr - 1, true);
        if (str[ptr] !== `
` && str[ptr] !== "\r") {
          throw new TomlError("invalid escape: only line-ending whitespace may be escaped", {
            toml: str,
            ptr: tmp
          });
        }
        ptr = skipVoid(str, ptr);
      } else if (c in ESC_MAP) {
        parsed += ESC_MAP[c];
      } else {
        throw new TomlError("unrecognized escape sequence", {
          toml: str,
          ptr: tmp
        });
      }
      sliceStart = ptr;
    } else if (!isLiteral && c === "\\") {
      tmp = ptr - 1;
      isEscape = true;
      parsed += str.slice(sliceStart, tmp);
    }
  }
  return parsed + str.slice(sliceStart, endPtr - 1);
}
function parseValue(value, toml, ptr, integersAsBigInt) {
  if (value === "true")
    return true;
  if (value === "false")
    return false;
  if (value === "-inf")
    return -Infinity;
  if (value === "inf" || value === "+inf")
    return Infinity;
  if (value === "nan" || value === "+nan" || value === "-nan")
    return NaN;
  if (value === "-0")
    return integersAsBigInt ? 0n : 0;
  let isInt = INT_REGEX.test(value);
  if (isInt || FLOAT_REGEX.test(value)) {
    if (LEADING_ZERO.test(value)) {
      throw new TomlError("leading zeroes are not allowed", {
        toml,
        ptr
      });
    }
    value = value.replace(/_/g, "");
    let numeric = +value;
    if (isNaN(numeric)) {
      throw new TomlError("invalid number", {
        toml,
        ptr
      });
    }
    if (isInt) {
      if ((isInt = !Number.isSafeInteger(numeric)) && !integersAsBigInt) {
        throw new TomlError("integer value cannot be represented losslessly", {
          toml,
          ptr
        });
      }
      if (isInt || integersAsBigInt === true)
        numeric = BigInt(value);
    }
    return numeric;
  }
  const date = new TomlDate(value);
  if (!date.isValid()) {
    throw new TomlError("invalid value", {
      toml,
      ptr
    });
  }
  return date;
}

// node_modules/smol-toml/dist/extract.js
/*!
 * Copyright (c) Squirrel Chat et al., All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
function sliceAndTrimEndOf(str, startPtr, endPtr) {
  let value = str.slice(startPtr, endPtr);
  let commentIdx = value.indexOf("#");
  if (commentIdx > -1) {
    skipComment(str, commentIdx);
    value = value.slice(0, commentIdx);
  }
  return [value.trimEnd(), commentIdx];
}
function extractValue(str, ptr, end, depth, integersAsBigInt) {
  if (depth === 0) {
    throw new TomlError("document contains excessively nested structures. aborting.", {
      toml: str,
      ptr
    });
  }
  let c = str[ptr];
  if (c === "[" || c === "{") {
    let [value, endPtr2] = c === "[" ? parseArray(str, ptr, depth, integersAsBigInt) : parseInlineTable(str, ptr, depth, integersAsBigInt);
    if (end) {
      endPtr2 = skipVoid(str, endPtr2);
      if (str[endPtr2] === ",")
        endPtr2++;
      else if (str[endPtr2] !== end) {
        throw new TomlError("expected comma or end of structure", {
          toml: str,
          ptr: endPtr2
        });
      }
    }
    return [value, endPtr2];
  }
  let endPtr;
  if (c === '"' || c === "'") {
    endPtr = getStringEnd(str, ptr);
    let parsed = parseString(str, ptr, endPtr);
    if (end) {
      endPtr = skipVoid(str, endPtr);
      if (str[endPtr] && str[endPtr] !== "," && str[endPtr] !== end && str[endPtr] !== `
` && str[endPtr] !== "\r") {
        throw new TomlError("unexpected character encountered", {
          toml: str,
          ptr: endPtr
        });
      }
      endPtr += +(str[endPtr] === ",");
    }
    return [parsed, endPtr];
  }
  endPtr = skipUntil(str, ptr, ",", end);
  let slice = sliceAndTrimEndOf(str, ptr, endPtr - +(str[endPtr - 1] === ","));
  if (!slice[0]) {
    throw new TomlError("incomplete key-value declaration: no value specified", {
      toml: str,
      ptr
    });
  }
  if (end && slice[1] > -1) {
    endPtr = skipVoid(str, ptr + slice[1]);
    endPtr += +(str[endPtr] === ",");
  }
  return [
    parseValue(slice[0], str, ptr, integersAsBigInt),
    endPtr
  ];
}

// node_modules/smol-toml/dist/struct.js
/*!
 * Copyright (c) Squirrel Chat et al., All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
var KEY_PART_RE = /^[a-zA-Z0-9-_]+[ \t]*$/;
function parseKey(str, ptr, end = "=") {
  let dot = ptr - 1;
  let parsed = [];
  let endPtr = str.indexOf(end, ptr);
  if (endPtr < 0) {
    throw new TomlError("incomplete key-value: cannot find end of key", {
      toml: str,
      ptr
    });
  }
  do {
    let c = str[ptr = ++dot];
    if (c !== " " && c !== "\t") {
      if (c === '"' || c === "'") {
        if (c === str[ptr + 1] && c === str[ptr + 2]) {
          throw new TomlError("multiline strings are not allowed in keys", {
            toml: str,
            ptr
          });
        }
        let eos = getStringEnd(str, ptr);
        if (eos < 0) {
          throw new TomlError("unfinished string encountered", {
            toml: str,
            ptr
          });
        }
        dot = str.indexOf(".", eos);
        let strEnd = str.slice(eos, dot < 0 || dot > endPtr ? endPtr : dot);
        let newLine = indexOfNewline(strEnd);
        if (newLine > -1) {
          throw new TomlError("newlines are not allowed in keys", {
            toml: str,
            ptr: ptr + dot + newLine
          });
        }
        if (strEnd.trimStart()) {
          throw new TomlError("found extra tokens after the string part", {
            toml: str,
            ptr: eos
          });
        }
        if (endPtr < eos) {
          endPtr = str.indexOf(end, eos);
          if (endPtr < 0) {
            throw new TomlError("incomplete key-value: cannot find end of key", {
              toml: str,
              ptr
            });
          }
        }
        parsed.push(parseString(str, ptr, eos));
      } else {
        dot = str.indexOf(".", ptr);
        let part = str.slice(ptr, dot < 0 || dot > endPtr ? endPtr : dot);
        if (!KEY_PART_RE.test(part)) {
          throw new TomlError("only letter, numbers, dashes and underscores are allowed in keys", {
            toml: str,
            ptr
          });
        }
        parsed.push(part.trimEnd());
      }
    }
  } while (dot + 1 && dot < endPtr);
  return [parsed, skipVoid(str, endPtr + 1, true, true)];
}
function parseInlineTable(str, ptr, depth, integersAsBigInt) {
  let res = {};
  let seen = new Set;
  let c;
  ptr++;
  while ((c = str[ptr++]) !== "}" && c) {
    if (c === ",") {
      throw new TomlError("expected value, found comma", {
        toml: str,
        ptr: ptr - 1
      });
    } else if (c === "#")
      ptr = skipComment(str, ptr);
    else if (c !== " " && c !== "\t" && c !== `
` && c !== "\r") {
      let k;
      let t = res;
      let hasOwn = false;
      let [key, keyEndPtr] = parseKey(str, ptr - 1);
      for (let i = 0;i < key.length; i++) {
        if (i)
          t = hasOwn ? t[k] : t[k] = {};
        k = key[i];
        if ((hasOwn = Object.hasOwn(t, k)) && (typeof t[k] !== "object" || seen.has(t[k]))) {
          throw new TomlError("trying to redefine an already defined value", {
            toml: str,
            ptr
          });
        }
        if (!hasOwn && k === "__proto__") {
          Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
        }
      }
      if (hasOwn) {
        throw new TomlError("trying to redefine an already defined value", {
          toml: str,
          ptr
        });
      }
      let [value, valueEndPtr] = extractValue(str, keyEndPtr, "}", depth - 1, integersAsBigInt);
      seen.add(value);
      t[k] = value;
      ptr = valueEndPtr;
    }
  }
  if (!c) {
    throw new TomlError("unfinished table encountered", {
      toml: str,
      ptr
    });
  }
  return [res, ptr];
}
function parseArray(str, ptr, depth, integersAsBigInt) {
  let res = [];
  let c;
  ptr++;
  while ((c = str[ptr++]) !== "]" && c) {
    if (c === ",") {
      throw new TomlError("expected value, found comma", {
        toml: str,
        ptr: ptr - 1
      });
    } else if (c === "#")
      ptr = skipComment(str, ptr);
    else if (c !== " " && c !== "\t" && c !== `
` && c !== "\r") {
      let e = extractValue(str, ptr - 1, "]", depth - 1, integersAsBigInt);
      res.push(e[0]);
      ptr = e[1];
    }
  }
  if (!c) {
    throw new TomlError("unfinished array encountered", {
      toml: str,
      ptr
    });
  }
  return [res, ptr];
}

// node_modules/smol-toml/dist/parse.js
/*!
 * Copyright (c) Squirrel Chat et al., All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
function peekTable(key, table, meta, type) {
  let t = table;
  let m = meta;
  let k;
  let hasOwn = false;
  let state;
  for (let i = 0;i < key.length; i++) {
    if (i) {
      t = hasOwn ? t[k] : t[k] = {};
      m = (state = m[k]).c;
      if (type === 0 && (state.t === 1 || state.t === 2)) {
        return null;
      }
      if (state.t === 2) {
        let l = t.length - 1;
        t = t[l];
        m = m[l].c;
      }
    }
    k = key[i];
    if ((hasOwn = Object.hasOwn(t, k)) && m[k]?.t === 0 && m[k]?.d) {
      return null;
    }
    if (!hasOwn) {
      if (k === "__proto__") {
        Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
        Object.defineProperty(m, k, { enumerable: true, configurable: true, writable: true });
      }
      m[k] = {
        t: i < key.length - 1 && type === 2 ? 3 : type,
        d: false,
        i: 0,
        c: {}
      };
    }
  }
  state = m[k];
  if (state.t !== type && !(type === 1 && state.t === 3)) {
    return null;
  }
  if (type === 2) {
    if (!state.d) {
      state.d = true;
      t[k] = [];
    }
    t[k].push(t = {});
    state.c[state.i++] = state = { t: 1, d: false, i: 0, c: {} };
  }
  if (state.d) {
    return null;
  }
  state.d = true;
  if (type === 1) {
    t = hasOwn ? t[k] : t[k] = {};
  } else if (type === 0 && hasOwn) {
    return null;
  }
  return [k, t, state.c];
}
function parse(toml, { maxDepth = 1000, integersAsBigInt } = {}) {
  let res = {};
  let meta = {};
  let tbl = res;
  let m = meta;
  for (let ptr = skipVoid(toml, 0);ptr < toml.length; ) {
    if (toml[ptr] === "[") {
      let isTableArray = toml[++ptr] === "[";
      let k = parseKey(toml, ptr += +isTableArray, "]");
      if (isTableArray) {
        if (toml[k[1] - 1] !== "]") {
          throw new TomlError("expected end of table declaration", {
            toml,
            ptr: k[1] - 1
          });
        }
        k[1]++;
      }
      let p = peekTable(k[0], res, meta, isTableArray ? 2 : 1);
      if (!p) {
        throw new TomlError("trying to redefine an already defined table or value", {
          toml,
          ptr
        });
      }
      m = p[2];
      tbl = p[1];
      ptr = k[1];
    } else {
      let k = parseKey(toml, ptr);
      let p = peekTable(k[0], tbl, m, 0);
      if (!p) {
        throw new TomlError("trying to redefine an already defined table or value", {
          toml,
          ptr
        });
      }
      let v = extractValue(toml, k[1], undefined, maxDepth, integersAsBigInt);
      p[1][p[0]] = v[0];
      ptr = v[1];
    }
    ptr = skipVoid(toml, ptr, true);
    if (toml[ptr] && toml[ptr] !== `
` && toml[ptr] !== "\r") {
      throw new TomlError("each key-value declaration must be followed by an end-of-line", {
        toml,
        ptr
      });
    }
    ptr = skipVoid(toml, ptr);
  }
  return res;
}

// node_modules/smol-toml/dist/stringify.js
/*!
 * Copyright (c) Squirrel Chat et al., All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

// node_modules/smol-toml/dist/index.js
/*!
 * Copyright (c) Squirrel Chat et al., All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

// src/config.ts
var PROVIDERS = {
  context7: {
    needsKey: false,
    role: "library_docs",
    fallbackRoles: [],
    envKeys: ["CONTEXT7_API_KEY"],
    homepage: "https://context7.com"
  },
  exa: {
    needsKey: true,
    role: "semantic_discovery",
    fallbackRoles: ["web_facts"],
    envKeys: ["EXA_API_KEY"],
    homepage: "https://dashboard.exa.ai/api-keys"
  },
  tavily: {
    needsKey: true,
    role: "web_facts",
    fallbackRoles: ["semantic_discovery"],
    envKeys: ["TAVILY_API_KEY"],
    homepage: "https://app.tavily.com/"
  },
  firecrawl: {
    needsKey: true,
    role: "url_fetch",
    fallbackRoles: [],
    envKeys: ["FIRECRAWL_API_KEY"],
    homepage: "https://www.firecrawl.dev/app/api-keys"
  },
  brave: {
    needsKey: true,
    role: "web_facts",
    fallbackRoles: ["semantic_discovery"],
    envKeys: ["BRAVE_API_KEY", "BRAVE_SEARCH_API_KEY"],
    homepage: "https://api.search.brave.com/app/keys"
  },
  duckduckgo: {
    needsKey: false,
    role: "web_facts_zero_key",
    fallbackRoles: ["semantic_discovery"],
    envKeys: [],
    homepage: "https://duckduckgo.com"
  }
};
var ROLE_FALLBACK_CHAIN = {
  library_docs: ["context7", "firecrawl", "duckduckgo"],
  semantic_discovery: ["exa", "tavily", "brave", "duckduckgo"],
  web_facts: ["tavily", "brave", "duckduckgo"],
  web_facts_zero_key: ["duckduckgo"],
  url_fetch: ["firecrawl"],
  url_crawl: ["firecrawl"]
};
function configDir() {
  return process.env.WSC_CONFIG_DIR ?? resolve2(homedir2(), ".config/wsc");
}
function cacheDir() {
  return process.env.WSC_CACHE_DIR ?? resolve2(homedir2(), ".cache/wsc");
}
function stateDir2() {
  return process.env.WSC_STATE_DIR ?? resolve2(homedir2(), ".local/state/wsc");
}
function keysPath() {
  return resolve2(configDir(), "keys.toml");
}
function budgetPath() {
  return resolve2(configDir(), "budget.toml");
}
function disabledDir() {
  return resolve2(configDir(), "disabled");
}
var KEYS_TEMPLATE = `# wsc API keys
#
# Each table maps to a provider. Set api_key = "..." to enable; comment out
# to disable that provider (wsc will fall back per the routing policy).
# Environment variables (e.g. EXA_API_KEY) take precedence over this file,
# so you can keep secrets out of $HOME if you prefer.

[context7]
# Optional. Free tier works without a key but with rate limits.
# api_key = "ctx7_..."

[exa]
# Get one at https://dashboard.exa.ai/api-keys
# api_key = "exa_..."

[tavily]
# Get one at https://app.tavily.com/
# api_key = "tvly_..."

[firecrawl]
# Get one at https://www.firecrawl.dev/app/api-keys
# api_key = "fc_..."

[brave]
# Get one at https://api.search.brave.com/app/keys
# Brave is a peer search provider, not a zero-key fallback.
# api_key = "BSA..."
`;
var BUDGET_TEMPLATE = `# wsc per-provider daily caps. wsc hard-fails when a cap would be exceeded.
# Comment a key to disable that cap (not recommended).

[exa]
daily_credit_cap = 1000
# daily_usd_cap = 5.00

[tavily]
daily_credit_cap = 1000
# daily_usd_cap = 5.00

[firecrawl]
daily_credit_cap = 500
# daily_usd_cap = 10.00

[brave]
daily_credit_cap = 2000
# daily_usd_cap = 0.00  # free tier; rate limited
`;
function readToml(path) {
  if (!existsSync2(path))
    return {};
  try {
    return parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}
function loadKeys() {
  const file = readToml(keysPath());
  const apiKeys = {};
  for (const [provider, meta] of Object.entries(PROVIDERS)) {
    let envValue;
    for (const envName of meta.envKeys) {
      const v = process.env[envName];
      if (v) {
        envValue = v;
        break;
      }
    }
    if (envValue) {
      apiKeys[provider] = envValue;
      continue;
    }
    const section = file[provider];
    if (section && typeof section === "object") {
      const k = section["api_key"];
      if (typeof k === "string" && k.trim()) {
        apiKeys[provider] = k.trim();
      }
    }
  }
  return {
    apiKeys,
    get(provider) {
      return apiKeys[provider];
    }
  };
}
function loadBudget() {
  const file = readToml(budgetPath());
  const caps = {};
  for (const [section, value] of Object.entries(file)) {
    if (!value || typeof value !== "object")
      continue;
    const sectionCaps = {};
    for (const k of ["daily_credit_cap", "daily_usd_cap"]) {
      const v = value[k];
      if (typeof v === "number" && Number.isFinite(v)) {
        sectionCaps[k] = v;
      }
    }
    if (Object.keys(sectionCaps).length > 0)
      caps[section] = sectionCaps;
  }
  return {
    perProvider: caps,
    forProvider(provider) {
      return caps[provider] ?? {};
    }
  };
}
function isDisabled(provider) {
  return existsSync2(resolve2(disabledDir(), provider));
}
function disable(provider) {
  if (!(provider in PROVIDERS))
    throw new Error(`unknown provider: ${provider}`);
  ensureDir2(disabledDir());
  const flag = resolve2(disabledDir(), provider);
  writeFileSync(flag, `disabled
`, "utf8");
  return flag;
}
function enable(provider) {
  if (!(provider in PROVIDERS))
    throw new Error(`unknown provider: ${provider}`);
  const flag = resolve2(disabledDir(), provider);
  if (existsSync2(flag)) {
    unlinkSync2(flag);
    return true;
  }
  return false;
}
function ensureDir2(dir) {
  if (!existsSync2(dir))
    mkdirSync2(dir, { recursive: true });
}
function init(opts = {}) {
  const actions = [];
  const cdir = configDir();
  const sdir = stateDir2();
  const chdir = cacheDir();
  const ddir = disabledDir();
  for (const d of [cdir, sdir, chdir, ddir]) {
    if (!existsSync2(d)) {
      mkdirSync2(d, { recursive: true });
      actions.push(`created dir ${d}`);
    }
  }
  const kp = keysPath();
  if (opts.force || !existsSync2(kp)) {
    writeFileSync(kp, KEYS_TEMPLATE, "utf8");
    try {
      chmodSync(kp, 384);
    } catch {}
    actions.push(`wrote ${kp}`);
  }
  const bp = budgetPath();
  if (opts.force || !existsSync2(bp)) {
    writeFileSync(bp, BUDGET_TEMPLATE, "utf8");
    try {
      chmodSync(bp, 384);
    } catch {}
    actions.push(`wrote ${bp}`);
  }
  return {
    ok: true,
    operation: "init",
    actions,
    paths: {
      config_dir: cdir,
      state_dir: sdir,
      cache_dir: chdir,
      keys_path: kp,
      budget_path: bp
    },
    returncode: 0
  };
}
function doctor(opts = {}) {
  const keys = loadKeys();
  const budget = loadBudget();
  const rows = [];
  for (const [name, meta] of Object.entries(PROVIDERS)) {
    const hasKey = !!keys.get(name);
    let status;
    if (isDisabled(name))
      status = "disabled";
    else if (meta.needsKey && !hasKey)
      status = "no_key";
    else if (name === "duckduckgo")
      status = "degraded";
    else
      status = "ready";
    rows.push({
      provider: name,
      role: meta.role,
      status,
      needs_key: meta.needsKey,
      has_key: hasKey,
      env_keys: meta.envKeys,
      budget: budget.forProvider(name),
      homepage: meta.homepage
    });
  }
  const available = new Set(rows.filter((r) => r.status === "ready" || r.status === "degraded").map((r) => r.provider));
  const roleChains = {};
  for (const [role, chain] of Object.entries(ROLE_FALLBACK_CHAIN)) {
    roleChains[role] = chain.filter((p) => available.has(p));
  }
  const payload = {
    ok: true,
    operation: "config.doctor",
    providers: rows,
    role_fallback_chains: roleChains,
    config_paths: { keys: keysPath(), budget: budgetPath(), disabled_dir: disabledDir() },
    returncode: 0,
    deep: !!opts.deep
  };
  if (opts.deep) {
    payload.deep_probes = Object.fromEntries(Object.keys(PROVIDERS).map((p) => [p, { status: "skipped", reason: "deep probes ship in v0.3" }]));
  }
  const primary = ["context7", "exa", "tavily", "firecrawl"];
  const workable = primary.filter((p) => available.has(p));
  if (workable.length === 0) {
    payload.ok = false;
    payload.returncode = 1;
    payload.hint = "No primary providers are ready. Run `wsc init`, edit keys.toml, or set EXA_API_KEY / TAVILY_API_KEY / FIRECRAWL_API_KEY in your env.";
  }
  return payload;
}

// src/providers/base.ts
class NormalizedResult {
  url;
  title;
  snippet;
  score;
  publishedAt;
  sourceKind;
  provider;
  urlNormalized;
  raw;
  constructor(init2) {
    this.url = init2.url;
    this.title = init2.title ?? "";
    this.snippet = init2.snippet ?? "";
    this.score = init2.score ?? null;
    this.publishedAt = init2.publishedAt ?? null;
    this.sourceKind = init2.sourceKind ?? "web";
    this.provider = init2.provider;
    this.raw = init2.raw;
    try {
      this.urlNormalized = init2.url ? normalizeUrl(init2.url) : "";
    } catch {
      this.urlNormalized = init2.url ?? "";
    }
  }
  toJSON(includeRaw = false) {
    const d = {
      url: redactUrl(this.url),
      title: this.title,
      snippet: this.snippet,
      score: this.score,
      published_at: this.publishedAt,
      source_kind: this.sourceKind,
      provider: this.provider,
      url_normalized: redactUrl(this.urlNormalized)
    };
    if (includeRaw)
      d.raw = this.raw;
    return d;
  }
}

class FetchedPage {
  url;
  title;
  markdown;
  html;
  metadata;
  provider;
  fetchedAt;
  urlNormalized;
  status;
  constructor(init2) {
    this.url = init2.url;
    this.title = init2.title ?? "";
    this.markdown = init2.markdown ?? "";
    this.html = init2.html ?? null;
    this.metadata = init2.metadata ?? {};
    this.provider = init2.provider;
    this.fetchedAt = init2.fetchedAt ?? null;
    this.status = init2.status ?? "ok";
    try {
      this.urlNormalized = init2.url ? normalizeUrl(init2.url) : "";
    } catch {
      this.urlNormalized = init2.url ?? "";
    }
  }
  toJSON() {
    return {
      url: redactUrl(this.url),
      title: this.title,
      markdown: this.markdown,
      metadata: this.metadata,
      provider: this.provider,
      fetched_at: this.fetchedAt,
      url_normalized: this.urlNormalized,
      status: this.status
    };
  }
}

class ProviderError extends Error {
  kind;
  retryable;
  status;
  constructor(message, opts = {}) {
    super(message);
    this.name = "ProviderError";
    this.kind = opts.kind ?? "provider_error";
    this.retryable = opts.retryable ?? false;
    this.status = opts.status ?? null;
  }
}

class TransportError extends ProviderError {
  constructor(message) {
    super(message, { kind: "transport_error", retryable: true });
    this.name = "TransportError";
  }
}

class RateLimitError extends ProviderError {
  retryAfter;
  constructor(message, retryAfter = null) {
    super(message, { kind: "rate_limit", retryable: true, status: 429 });
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

class AuthError extends ProviderError {
  constructor(message) {
    super(message, { kind: "auth_error", retryable: false, status: 401 });
    this.name = "AuthError";
  }
}

class MissingKeyError extends ProviderError {
  provider;
  constructor(provider) {
    super(`${provider}: API key not configured`, { kind: "missing_key" });
    this.name = "MissingKeyError";
    this.provider = provider;
  }
}

class DisabledError extends ProviderError {
  provider;
  constructor(provider) {
    super(`${provider}: provider is disabled (wsc config enable ${provider} to undo)`, { kind: "disabled" });
    this.name = "DisabledError";
    this.provider = provider;
  }
}
function safeGet(payload, path, fallback) {
  let val = payload;
  for (const key of path) {
    if (val == null)
      return fallback;
    if (typeof key === "number") {
      if (!Array.isArray(val) || key >= val.length)
        return fallback;
      val = val[key];
    } else {
      if (typeof val !== "object")
        return fallback;
      val = val[key];
    }
  }
  return val ?? fallback;
}
var DEFAULT_TIMEOUT_MS = 30000;
var USER_AGENT = "wsc/0.2 (+https://github.com/heggria/web-surfing-cli)";
async function httpRequest(url, opts = {}) {
  const method = opts.method ?? "GET";
  const headers = { "user-agent": USER_AGENT, ...lowerKeys(opts.headers ?? {}) };
  let finalUrl = url;
  if (opts.params) {
    const u = new URL(url);
    for (const [k, v] of Object.entries(opts.params))
      u.searchParams.set(k, v);
    finalUrl = u.toString();
  }
  let body;
  if (opts.body !== undefined && opts.body !== null) {
    if (typeof opts.body === "string" || opts.body instanceof Uint8Array) {
      body = opts.body;
    } else {
      body = JSON.stringify(opts.body);
      if (!("content-type" in headers))
        headers["content-type"] = "application/json";
    }
  }
  const ctrl = new AbortController;
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(finalUrl, { method, headers, body, signal: ctrl.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new TransportError(`${finalUrl}: request timed out`);
    }
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    throw new TransportError(`${finalUrl}: ${msg}`);
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  const respHeaders = {};
  response.headers.forEach((v, k) => {
    respHeaders[k.toLowerCase()] = v;
  });
  if (response.status >= 200 && response.status < 300) {
    return { status: response.status, headers: respHeaders, text, json };
  }
  if (response.status === 429) {
    const ra = respHeaders["retry-after"];
    const retryAfter = ra ? Number.parseFloat(ra) : null;
    throw new RateLimitError(`${finalUrl}: HTTP 429 rate limit`, Number.isFinite(retryAfter) ? retryAfter : null);
  }
  if (response.status === 401 || response.status === 403) {
    throw new AuthError(`${finalUrl}: HTTP ${response.status} ${response.statusText}`);
  }
  throw new ProviderError(`${finalUrl}: HTTP ${response.status} ${response.statusText} body=${JSON.stringify(text.slice(0, 200))}`, { status: response.status });
}
function lowerKeys(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj))
    out[k.toLowerCase()] = v;
  return out;
}

class Provider {
}

// src/providers/brave.ts
var ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

class BraveProvider extends Provider {
  name = "brave";
  schemaVersion = "brave-v1-2026-04";
  apiKey;
  constructor(apiKey) {
    super();
    this.apiKey = apiKey;
  }
  ensureKey() {
    if (!this.apiKey)
      throw new MissingKeyError(this.name);
    return this.apiKey;
  }
  async search(query, opts = {}) {
    const params = { q: query, count: String(opts.count ?? 10) };
    if (opts.country)
      params.country = opts.country;
    if (opts.freshness)
      params.freshness = opts.freshness;
    const response = await httpRequest(ENDPOINT, {
      method: "GET",
      headers: { "x-subscription-token": this.ensureKey(), accept: "application/json" },
      params,
      timeoutMs: opts.timeoutMs
    });
    return this.normalize(response.json ?? {});
  }
  normalize(payload) {
    const results = safeGet(payload, ["web", "results"], []) ?? [];
    const out = [];
    for (const r of results) {
      const url = safeGet(r, ["url"], "") ?? "";
      if (!url)
        continue;
      out.push(new NormalizedResult({
        url,
        title: safeGet(r, ["title"], "") ?? "",
        snippet: safeGet(r, ["description"], "") ?? "",
        score: null,
        publishedAt: safeGet(r, ["page_age"]) ?? null,
        sourceKind: "web",
        provider: this.name,
        raw: r
      }));
    }
    return out;
  }
}

// src/providers/context7.ts
var BASE_URL = "https://context7.com/api/v1";

class Context7Provider extends Provider {
  name = "context7";
  schemaVersion = "context7-v1-2026-04";
  apiKey;
  constructor(apiKey) {
    super();
    this.apiKey = apiKey;
  }
  headers() {
    const h = { accept: "application/json" };
    if (this.apiKey)
      h.authorization = `Bearer ${this.apiKey}`;
    return h;
  }
  async resolveLibrary(library, opts = {}) {
    const response = await httpRequest(`${BASE_URL}/search`, {
      method: "GET",
      headers: this.headers(),
      params: { query: library },
      timeoutMs: opts.timeoutMs ?? 20000
    });
    return this.normalizeSearch(response.json ?? {});
  }
  normalizeSearch(payload) {
    const results = safeGet(payload, ["results"], []) ?? [];
    const out = [];
    for (const r of results) {
      const libId = safeGet(r, ["id"]) ?? safeGet(r, ["libraryId"]) ?? "";
      if (!libId)
        continue;
      const url = `${BASE_URL}${libId.startsWith("/") ? libId : "/" + libId}`;
      out.push(new NormalizedResult({
        url,
        title: safeGet(r, ["title"], libId) ?? libId,
        snippet: safeGet(r, ["description"], "") ?? "",
        sourceKind: "doc",
        provider: this.name,
        raw: r
      }));
    }
    return out;
  }
  async getDocs(libraryId, opts = {}) {
    const id = libraryId.startsWith("/") ? libraryId : "/" + libraryId;
    const params = { type: "txt", tokens: String(opts.tokens ?? 4000) };
    if (opts.topic)
      params.topic = opts.topic;
    const url = `${BASE_URL}${id}`;
    const response = await httpRequest(url, {
      method: "GET",
      headers: this.headers(),
      params,
      timeoutMs: opts.timeoutMs ?? 30000
    });
    const text = response.text ?? "";
    if (!text.trim()) {
      throw new ProviderError(`context7: empty docs response for ${id}`);
    }
    return new FetchedPage({
      url,
      title: id.replace(/^\//, ""),
      markdown: text,
      metadata: { library_id: id, topic: opts.topic ?? null, tokens: opts.tokens ?? 4000 },
      provider: this.name,
      status: "ok"
    });
  }
}

// src/providers/duckduckgo.ts
var LITE_ENDPOINT = "https://html.duckduckgo.com/html/";
var RESULT_RE = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
var SNIPPET_RE = /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
var TAG_RE = /<[^>]+>/g;
var DDG_REDIRECT_RE = /^(?:https?:)?\/\/duckduckgo\.com\/l\/\?uddg=([^&]+)/i;
var ENTITY_MAP = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " "
};
function decodeEntities(s) {
  return s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITY_MAP[m] ?? m).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)));
}
function stripHtml(s) {
  return decodeEntities(s.replace(TAG_RE, "")).trim();
}
function followRedirect(url) {
  const m = DDG_REDIRECT_RE.exec(url);
  if (m && m[1])
    return decodeURIComponent(m[1]);
  if (url.startsWith("//"))
    return `https:${url}`;
  return url;
}

class DuckDuckGoProvider extends Provider {
  name = "duckduckgo";
  schemaVersion = "ddg-html-v1-2026-04";
  constructor(_apiKey) {
    super();
  }
  async search(query, opts = {}) {
    const response = await httpRequest(LITE_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `q=${encodeURIComponent(query)}`,
      timeoutMs: opts.timeoutMs
    });
    return this.normalize(response.text ?? "", opts.count ?? 10);
  }
  normalize(htmlText, limit = 10) {
    if (!htmlText)
      return [];
    const urls = [];
    let m;
    const reUrls = new RegExp(RESULT_RE.source, RESULT_RE.flags);
    while ((m = reUrls.exec(htmlText)) !== null)
      urls.push([m[1] ?? "", m[2] ?? ""]);
    const snippets = [];
    const reSnips = new RegExp(SNIPPET_RE.source, SNIPPET_RE.flags);
    while ((m = reSnips.exec(htmlText)) !== null)
      snippets.push(m[1] ?? "");
    const out = [];
    for (let i = 0;i < Math.min(urls.length, limit); i++) {
      const [rawUrl, titleHtml] = urls[i];
      const url = followRedirect(rawUrl);
      if (!url)
        continue;
      out.push(new NormalizedResult({
        url,
        title: stripHtml(titleHtml),
        snippet: i < snippets.length ? stripHtml(snippets[i] ?? "") : "",
        score: null,
        sourceKind: "web",
        provider: this.name
      }));
    }
    return out;
  }
}

// src/providers/exa.ts
var ENDPOINT2 = "https://api.exa.ai/search";

class ExaProvider extends Provider {
  name = "exa";
  schemaVersion = "exa-v1-2026-04";
  apiKey;
  constructor(apiKey) {
    super();
    this.apiKey = apiKey;
  }
  ensureKey() {
    if (!this.apiKey)
      throw new MissingKeyError(this.name);
    return this.apiKey;
  }
  async search(query, opts = {}) {
    const body = {
      query,
      numResults: opts.numResults ?? 10
    };
    if (opts.type)
      body.type = opts.type;
    if (opts.category)
      body.category = opts.category;
    if (opts.startPublishedDate)
      body.startPublishedDate = opts.startPublishedDate;
    if (opts.endPublishedDate)
      body.endPublishedDate = opts.endPublishedDate;
    if (opts.includeDomains)
      body.includeDomains = opts.includeDomains;
    if (opts.excludeDomains)
      body.excludeDomains = opts.excludeDomains;
    const response = await httpRequest(ENDPOINT2, {
      method: "POST",
      headers: { "x-api-key": this.ensureKey() },
      body,
      timeoutMs: opts.timeoutMs
    });
    return this.normalize(response.json ?? {}, opts.category);
  }
  normalize(payload, category) {
    const results = safeGet(payload, ["results"], []) ?? [];
    const kind = categoryToKind(category);
    const out = [];
    for (const r of results) {
      const url = safeGet(r, ["url"], "") ?? "";
      if (!url)
        continue;
      const text = safeGet(r, ["text"]) ?? safeGet(r, ["summary"]) ?? "";
      out.push(new NormalizedResult({
        url,
        title: safeGet(r, ["title"], "") ?? "",
        snippet: text,
        score: toFloat(safeGet(r, ["score"])),
        publishedAt: safeGet(r, ["publishedDate"]) ?? null,
        sourceKind: kind,
        provider: this.name,
        raw: r
      }));
    }
    return out;
  }
}
function toFloat(v) {
  if (v == null)
    return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function categoryToKind(category) {
  if (!category)
    return "web";
  const c = category.toLowerCase();
  if (c.includes("paper"))
    return "paper";
  if (c.includes("code") || c.includes("github"))
    return "code";
  if (c.includes("compan"))
    return "company";
  if (c.includes("person") || c.includes("people"))
    return "company";
  return "web";
}

// src/providers/firecrawl.ts
var BASE_URL2 = "https://api.firecrawl.dev/v1";

class FirecrawlProvider extends Provider {
  name = "firecrawl";
  schemaVersion = "firecrawl-v1-2026-04";
  apiKey;
  constructor(apiKey) {
    super();
    this.apiKey = apiKey;
  }
  ensureKey() {
    if (!this.apiKey)
      throw new MissingKeyError(this.name);
    return this.apiKey;
  }
  authHeaders() {
    return { authorization: `Bearer ${this.ensureKey()}` };
  }
  async scrape(url, opts = {}) {
    const formats = opts.formats?.length ? [...opts.formats] : ["markdown"];
    if (opts.screenshot && !formats.includes("screenshot"))
      formats.push("screenshot");
    const body = {
      url,
      formats,
      onlyMainContent: opts.onlyMainContent ?? true
    };
    const response = await httpRequest(`${BASE_URL2}/scrape`, {
      method: "POST",
      headers: this.authHeaders(),
      body,
      timeoutMs: opts.timeoutMs ?? 60000
    });
    return this.normalizeScrape(response.json ?? {}, url);
  }
  normalizeScrape(payload, requestedUrl) {
    if (!safeGet(payload, ["success"], false)) {
      const err = safeGet(payload, ["error"]) ?? "scrape failed";
      throw new ProviderError(`firecrawl: ${err}`);
    }
    const data = safeGet(payload, ["data"], {}) ?? {};
    const url = (safeGet(data, ["metadata", "sourceURL"]) ?? requestedUrl) || requestedUrl;
    return new FetchedPage({
      url,
      title: safeGet(data, ["metadata", "title"], "") ?? "",
      markdown: safeGet(data, ["markdown"], "") ?? "",
      html: safeGet(data, ["html"]) ?? null,
      metadata: safeGet(data, ["metadata"], {}) ?? {},
      provider: this.name,
      fetchedAt: safeGet(data, ["metadata", "fetchTime"]) ?? null,
      status: "ok"
    });
  }
  async startCrawl(url, opts = {}) {
    const body = {
      url,
      limit: opts.limit ?? 10,
      scrapeOptions: { formats: opts.formats ?? ["markdown"] }
    };
    if (opts.includePaths)
      body.includePaths = opts.includePaths;
    if (opts.excludePaths)
      body.excludePaths = opts.excludePaths;
    const response = await httpRequest(`${BASE_URL2}/crawl`, {
      method: "POST",
      headers: this.authHeaders(),
      body,
      timeoutMs: 60000
    });
    const payload = response.json ?? {};
    if (!safeGet(payload, ["success"], false)) {
      throw new ProviderError(`firecrawl: crawl failed to start: ${JSON.stringify(safeGet(payload, ["error"]))}`);
    }
    const id = safeGet(payload, ["id"]);
    if (!id)
      throw new ProviderError(`firecrawl: crawl response missing id`);
    return id;
  }
  async pollCrawl(jobId) {
    const response = await httpRequest(`${BASE_URL2}/crawl/${jobId}`, {
      method: "GET",
      headers: this.authHeaders(),
      timeoutMs: 30000
    });
    return response.json ?? {};
  }
  async crawl(url, opts = {}) {
    const id = await this.startCrawl(url, opts);
    const interval = opts.pollIntervalMs ?? 2000;
    const deadline = Date.now() + (opts.maxWaitMs ?? 300000);
    while (Date.now() < deadline) {
      const status = await this.pollCrawl(id);
      const state = safeGet(status, ["status"]);
      if (state === "completed" || state === "failed") {
        if (state === "failed") {
          throw new ProviderError(`firecrawl: crawl ${id} failed: ${JSON.stringify(safeGet(status, ["error"]))}`);
        }
        const items = safeGet(status, ["data"], []) ?? [];
        return items.map((item) => this.pageFromCrawlItem(item, id));
      }
      await sleep(interval);
    }
    throw new ProviderError(`firecrawl: crawl ${id} did not complete in ${opts.maxWaitMs ?? 300000}ms`);
  }
  pageFromCrawlItem(item, jobId) {
    const url = safeGet(item, ["metadata", "sourceURL"]) ?? safeGet(item, ["url"]) ?? "";
    return new FetchedPage({
      url,
      title: safeGet(item, ["metadata", "title"], "") ?? "",
      markdown: safeGet(item, ["markdown"], "") ?? "",
      html: safeGet(item, ["html"]) ?? null,
      metadata: { crawl_job_id: jobId, ...safeGet(item, ["metadata"], {}) ?? {} },
      provider: this.name,
      fetchedAt: safeGet(item, ["metadata", "fetchTime"]) ?? null,
      status: "ok"
    });
  }
  searchResultsFromPages(pages) {
    return pages.filter((p) => p.url).map((p) => new NormalizedResult({
      url: p.url,
      title: p.title || p.url,
      snippet: p.markdown.slice(0, 240),
      sourceKind: "web",
      provider: this.name
    }));
  }
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// src/providers/tavily.ts
var ENDPOINT3 = "https://api.tavily.com/search";

class TavilyProvider extends Provider {
  name = "tavily";
  schemaVersion = "tavily-v1-2026-04";
  apiKey;
  constructor(apiKey) {
    super();
    this.apiKey = apiKey;
  }
  ensureKey() {
    if (!this.apiKey)
      throw new MissingKeyError(this.name);
    return this.apiKey;
  }
  async search(query, opts = {}) {
    const body = {
      api_key: this.ensureKey(),
      query,
      max_results: opts.maxResults ?? 10,
      search_depth: opts.searchDepth ?? "basic"
    };
    if (opts.topic)
      body.topic = opts.topic;
    if (opts.days != null)
      body.days = opts.days;
    if (opts.includeDomains)
      body.include_domains = opts.includeDomains;
    if (opts.excludeDomains)
      body.exclude_domains = opts.excludeDomains;
    if (opts.country)
      body.country = opts.country;
    const response = await httpRequest(ENDPOINT3, { method: "POST", body, timeoutMs: opts.timeoutMs });
    return this.normalize(response.json ?? {});
  }
  normalize(payload) {
    const results = safeGet(payload, ["results"], []) ?? [];
    const out = [];
    for (const r of results) {
      const url = safeGet(r, ["url"], "") ?? "";
      if (!url)
        continue;
      out.push(new NormalizedResult({
        url,
        title: safeGet(r, ["title"], "") ?? "",
        snippet: safeGet(r, ["content"], "") ?? "",
        score: toFloat2(safeGet(r, ["score"])),
        publishedAt: safeGet(r, ["published_date"]) ?? null,
        sourceKind: "web",
        provider: this.name,
        raw: r
      }));
    }
    return out;
  }
}
function toFloat2(v) {
  if (v == null)
    return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// src/providers/index.ts
var FACTORY = {
  context7: Context7Provider,
  exa: ExaProvider,
  tavily: TavilyProvider,
  firecrawl: FirecrawlProvider,
  brave: BraveProvider,
  duckduckgo: DuckDuckGoProvider
};
var KEY_OPTIONAL = new Set(["context7", "duckduckgo"]);
function getProvider(name) {
  if (!(name in FACTORY))
    throw new Error(`unknown provider: ${name}`);
  if (!(name in PROVIDERS))
    throw new Error(`provider not in catalog: ${name}`);
  if (isDisabled(name))
    throw new DisabledError(name);
  const keys = loadKeys();
  const Cls = FACTORY[name];
  if (KEY_OPTIONAL.has(name)) {
    return new Cls(keys.get(name));
  }
  const apiKey = keys.get(name);
  if (!apiKey)
    throw new MissingKeyError(name);
  return new Cls(apiKey);
}

// src/ops/_chain.ts
function filteredChain(role) {
  return [...ROLE_FALLBACK_CHAIN[role] ?? []];
}
async function runChain(chain, actions) {
  const fallback = [];
  for (const name of chain) {
    const action = actions[name];
    if (!action)
      continue;
    let provider;
    try {
      provider = getProvider(name);
    } catch (err) {
      if (err instanceof MissingKeyError || err instanceof DisabledError) {
        fallback.push({ from: name, reason: err.kind });
        continue;
      }
      throw err;
    }
    try {
      const result = await action(provider);
      return { active: name, result, fallback };
    } catch (err) {
      if (err instanceof RateLimitError || err instanceof TransportError || err instanceof AuthError || err instanceof ProviderError) {
        fallback.push({
          from: name,
          reason: err.kind,
          error: String(err.message ?? err).slice(0, 200)
        });
        continue;
      }
      throw err;
    }
  }
  return { active: null, result: null, fallback };
}
async function chainFailedPayload(opName, fallback) {
  return {
    ok: false,
    operation: opName,
    provider: null,
    fallback_chain: fallback,
    error: `${opName}: all providers failed (chain=${JSON.stringify(fallback.map((f) => f.from))})`,
    returncode: 2
  };
}

// src/ops/crawl.ts
function gatePages(maxPages, opts) {
  if (maxPages <= 10)
    return null;
  if (maxPages <= 100 && !opts.apply)
    return `crawl of ${maxPages} pages requires --apply (range 11–100)`;
  if (maxPages > 100 && !(opts.apply && opts.deepApply)) {
    return `crawl of ${maxPages} pages requires --apply --i-know-this-burns-credits`;
  }
  return null;
}
async function run(url, opts = {}) {
  const maxPages = opts.maxPages ?? 10;
  const block = gatePages(maxPages, { apply: !!opts.apply, deepApply: !!opts.deepApply });
  if (block) {
    return {
      ok: false,
      operation: "crawl",
      error: block,
      url,
      max_pages: maxPages,
      fallback_chain: [],
      returncode: 2
    };
  }
  return await withCall("crawl", { provider: "firecrawl", correlationId: opts.correlationId, noReceipt: opts.noReceipt }, async (receipt) => {
    Object.assign(receipt, queryFingerprint(url));
    receipt.params = {
      max_pages: maxPages,
      include_paths: opts.includePaths ?? null,
      exclude_paths: opts.excludePaths ?? null,
      formats: opts.formats ?? null,
      apply: !!opts.apply
    };
    let provider;
    try {
      provider = getProvider("firecrawl");
    } catch (err) {
      if (err instanceof MissingKeyError || err instanceof DisabledError) {
        receipt.status = "error";
        receipt.fallback_chain = [{ from: "firecrawl", reason: err.kind }];
        return {
          ok: false,
          operation: "crawl",
          provider: null,
          fallback_chain: receipt.fallback_chain,
          error: err.message,
          returncode: 2
        };
      }
      throw err;
    }
    try {
      const pages = await provider.crawl(url, {
        limit: maxPages,
        includePaths: opts.includePaths,
        excludePaths: opts.excludePaths,
        formats: opts.formats
      });
      receipt.provider = "firecrawl";
      receipt.fallback_chain = [];
      const urls = pages.map((p) => p.url).filter((u) => !!u);
      receipt.selected_urls = urls;
      receipt.selected_count = urls.length;
      receipt.results_count = pages.length;
      return {
        ok: true,
        operation: "crawl",
        provider: "firecrawl",
        url,
        max_pages: maxPages,
        pages: pages.map((p) => p.toJSON()),
        returncode: 0
      };
    } catch (err) {
      receipt.status = "error";
      receipt.error = (err instanceof Error ? err.message : String(err)).slice(0, 200);
      return {
        ok: false,
        operation: "crawl",
        provider: "firecrawl",
        error: err instanceof ProviderError ? err.message : String(err),
        returncode: 1
      };
    }
  });
}

// src/ops/discover.ts
var TYPE_TO_EXA_CATEGORY = {
  code: "github",
  paper: "research paper",
  company: "company",
  people: "person"
};
async function run2(query, opts = {}) {
  const chain = filteredChain("semantic_discovery");
  const category = opts.type ? TYPE_TO_EXA_CATEGORY[opts.type] : undefined;
  const framed = reframeForKeywordSearch(query, opts.type);
  const num = opts.numResults ?? 10;
  const exaAction = (provider) => provider.search(query, {
    numResults: num,
    type: "auto",
    category,
    startPublishedDate: opts.sinceDays ? daysAgoIso(opts.sinceDays) : undefined
  });
  const tavilyAction = (provider) => provider.search(framed, { maxResults: num, searchDepth: "advanced" });
  const braveAction = (provider) => provider.search(framed, { count: num });
  const ddgAction = (provider) => provider.search(framed, { count: num });
  return await withCall("discover", { provider: chain[0] ?? null, correlationId: opts.correlationId, noReceipt: opts.noReceipt }, async (receipt) => {
    Object.assign(receipt, queryFingerprint(query));
    receipt.params = { type: opts.type ?? null, sinceDays: opts.sinceDays ?? null, numResults: num };
    const { active, result, fallback } = await runChain(chain, {
      exa: exaAction,
      tavily: tavilyAction,
      brave: braveAction,
      duckduckgo: ddgAction
    });
    receipt.fallback_chain = fallback;
    if (active === null || result === null) {
      receipt.status = "error";
      return await chainFailedPayload("discover", fallback);
    }
    receipt.provider = active;
    const urls = result.map((r) => r.url);
    receipt.selected_urls = urls;
    receipt.results_count = result.length;
    receipt.selected_count = result.length;
    if (active !== chain[0])
      receipt.status = "degraded";
    return {
      ok: true,
      operation: "discover",
      provider: active,
      query,
      results: result.map((r) => r.toJSON()),
      fallback_chain: fallback,
      status: active !== chain[0] ? "degraded" : "ok",
      returncode: 0
    };
  });
}
function daysAgoIso(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}
function reframeForKeywordSearch(query, type) {
  if (!type)
    return query;
  if (type === "paper")
    return `research papers about: ${query}`;
  if (type === "code")
    return `github examples of: ${query}`;
  if (type === "company")
    return `company information about: ${query}`;
  if (type === "people")
    return `people associated with: ${query}`;
  return query;
}

// src/ops/docs.ts
async function run3(library, opts = {}) {
  const chain = filteredChain("library_docs");
  const context7Action = async (provider) => {
    const ctx = provider;
    const candidates = await ctx.resolveLibrary(library);
    if (candidates.length === 0)
      throw new ProviderError(`context7: no library found for ${JSON.stringify(library)}`);
    const top = candidates[0];
    const libraryId = (top.url.split("/api/v1", 2)[1] ?? "/" + library) || "/" + library;
    const page = await ctx.getDocs(libraryId, { topic: opts.topic });
    return { library_id: libraryId, page };
  };
  const firecrawlAction = async (provider) => {
    const fc = provider;
    const guesses = [
      `https://raw.githubusercontent.com/${library}/${library}/main/README.md`,
      `https://github.com/${library}/${library}`
    ];
    let lastErr = null;
    for (const url of guesses) {
      try {
        const page = await fc.scrape(url);
        page.status = "degraded";
        return { library_id: library, page };
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr instanceof Error ? lastErr : new ProviderError("firecrawl: no readme found for fallback");
  };
  return await withCall("docs", { provider: chain[0] ?? null, correlationId: opts.correlationId, noReceipt: opts.noReceipt }, async (receipt) => {
    Object.assign(receipt, queryFingerprint(library));
    receipt.params = { topic: opts.topic ?? null, version: opts.version ?? null };
    const { active, result, fallback } = await runChain(chain, {
      context7: context7Action,
      firecrawl: firecrawlAction
    });
    receipt.fallback_chain = fallback;
    if (active === null || result === null) {
      receipt.status = "error";
      const failed = await chainFailedPayload("docs", fallback);
      return {
        ...failed,
        library,
        fallback_chain: fallback
      };
    }
    receipt.provider = active;
    const page = result.page;
    receipt.selected_urls = page.url ? [page.url] : [];
    receipt.selected_count = page.url ? 1 : 0;
    receipt.results_count = 1;
    if (page.status === "degraded")
      receipt.status = "degraded";
    return {
      ok: true,
      operation: "docs",
      provider: active,
      library,
      library_id: result.library_id,
      topic: opts.topic ?? null,
      page: page.toJSON(),
      fallback_chain: fallback,
      status: page.status,
      returncode: 0
    };
  });
}

// src/ops/fetch.ts
var TAG_RE2 = /<[^>]+>/g;
var WS_RE = /\n{3,}/g;
var ENTITY_MAP2 = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
function decodeEntities2(s) {
  return s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITY_MAP2[m] ?? m).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)));
}
async function stdlibFetch(url) {
  const resp = await httpRequest(url, { method: "GET", timeoutMs: 30000 });
  const text = resp.text;
  const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities2(titleMatch[1].trim()) : url;
  const body = decodeEntities2(text.replace(TAG_RE2, `
`)).trim().replace(WS_RE, `

`);
  return new FetchedPage({
    url,
    title,
    markdown: body.slice(0, 50000),
    provider: "urllib",
    status: "degraded"
  });
}
async function run4(url, opts = {}) {
  const chain = filteredChain("url_fetch");
  const firecrawlAction = (provider) => provider.scrape(url, { formats: opts.formats, screenshot: opts.screenshot });
  return await withCall("fetch", { provider: "firecrawl", correlationId: opts.correlationId, noReceipt: opts.noReceipt }, async (receipt) => {
    Object.assign(receipt, queryFingerprint(url));
    receipt.params = { formats: opts.formats ?? null, screenshot: !!opts.screenshot };
    const { active, result, fallback } = await runChain(chain, { firecrawl: firecrawlAction });
    receipt.fallback_chain = [...fallback];
    if (active === null || result === null) {
      try {
        const page = await stdlibFetch(url);
        receipt.fallback_chain.push({
          from: "firecrawl",
          to: "urllib",
          reason: "all_providers_failed"
        });
        receipt.provider = "urllib";
        receipt.status = "degraded";
        receipt.selected_urls = [page.url];
        receipt.selected_count = 1;
        receipt.results_count = 1;
        return {
          ok: true,
          operation: "fetch",
          provider: "urllib",
          page: page.toJSON(),
          fallback_chain: receipt.fallback_chain,
          status: "degraded",
          returncode: 0
        };
      } catch (err) {
        receipt.status = "error";
        receipt.error = (err instanceof Error ? err.message : String(err)).slice(0, 200);
        receipt.fallback_chain.push({
          from: "urllib",
          reason: "transport_error",
          error: (err instanceof Error ? err.message : String(err)).slice(0, 200)
        });
        return {
          ok: false,
          operation: "fetch",
          provider: null,
          fallback_chain: receipt.fallback_chain,
          error: `fetch failed: ${err instanceof Error ? err.message : String(err)}`,
          returncode: 2
        };
      }
    }
    receipt.provider = active;
    receipt.selected_urls = result.url ? [result.url] : [];
    receipt.selected_count = 1;
    receipt.results_count = 1;
    return {
      ok: true,
      operation: "fetch",
      provider: active,
      page: result.toJSON(),
      fallback_chain: receipt.fallback_chain,
      status: result.status,
      returncode: 0
    };
  });
}

// src/routing.ts
var KNOWN_LIBRARIES = new Set([
  "react",
  "vue",
  "svelte",
  "solid",
  "next",
  "nuxt",
  "remix",
  "astro",
  "vite",
  "esbuild",
  "webpack",
  "turbopack",
  "rollup",
  "tailwind",
  "shadcn",
  "chakra",
  "mantine",
  "radix",
  "node",
  "nodejs",
  "bun",
  "deno",
  "express",
  "fastify",
  "hono",
  "nestjs",
  "koa",
  "elysia",
  "tanstack",
  "react-query",
  "zustand",
  "redux",
  "jotai",
  "valtio",
  "recoil",
  "trpc",
  "drizzle",
  "prisma",
  "knex",
  "mongoose",
  "typeorm",
  "django",
  "flask",
  "fastapi",
  "starlette",
  "litestar",
  "pydantic",
  "sqlalchemy",
  "alembic",
  "celery",
  "huey",
  "pandas",
  "numpy",
  "polars",
  "scikit-learn",
  "scipy",
  "axum",
  "actix",
  "tokio",
  "rocket",
  "tonic",
  "spring",
  "quarkus",
  "ktor",
  "exposed",
  "swiftui",
  "uikit",
  "vapor",
  "anthropic",
  "openai",
  "langchain",
  "llamaindex",
  "ollama",
  "supabase",
  "firebase",
  "convex",
  "neon",
  "planetscale",
  "git",
  "docker",
  "kubernetes",
  "k8s",
  "terraform",
  "pulumi",
  "pytest",
  "jest",
  "vitest",
  "playwright",
  "cypress",
  "kotlin",
  "swift",
  "rust",
  "golang",
  "python",
  "typescript",
  "javascript",
  "claude-code",
  "cursor",
  "codex",
  "opencode"
]);
var DISCOVERY_PATTERNS = [
  /\balternatives?\s+to\b/i,
  /\bsimilar\s+to\b/i,
  /\b(vs\.?|versus)\b/i,
  /\b(find\s+me|find|look\s+up)\s+(papers?|projects?|libraries?|tools?|companies?|people)\b/i,
  /\b(papers?|research)\s+(on|about)\b/i,
  /\b(competitors?|comparison|landscape|survey)\b/i,
  /\b(libraries?|tools?|projects?)\s+like\b/i,
  /\b(compare|comparing|differences?\s+between)\b/i
];
var TIME_PATTERNS = [
  /\b(today|tonight|tomorrow|yesterday|now|currently|recent(ly)?|latest|news|updates?|changelog|release\s+notes?|roadmap|announcement)\b/i,
  /\b20[2-9]\d\b/,
  /\b(price|pricing|cost|fees?)\b/i,
  /\bversion\s+\d/i
];
var URL_RE = /^\s*https?:\/\//i;
var OP_TO_PROVIDER = {
  docs: "context7",
  discover: "exa",
  fetch: "firecrawl",
  crawl: "firecrawl",
  search: "tavily"
};
var OP_TO_INTENT = {
  docs: "library_docs",
  discover: "semantic_discovery",
  fetch: "url_fetch",
  crawl: "url_crawl",
  search: "web_facts"
};

class RuleRouter {
  classifierVersion = "rule-v1";
  classify(query, context = {}) {
    const q = (query ?? "").trim();
    const candidates = [];
    if (URL_RE.test(q)) {
      const op = q.endsWith("/*") || q.includes("/**") ? "crawl" : "fetch";
      candidates.push({ op, confidence: 0.95, reason: `url_detected → ${op}` });
    }
    const tokens = q.toLowerCase().match(/[a-z][a-z0-9_-]+/g) ?? [];
    const libraryHits = tokens.filter((t) => KNOWN_LIBRARIES.has(t));
    const discoveryHit = DISCOVERY_PATTERNS.some((p) => p.test(q));
    const timeHit = TIME_PATTERNS.some((p) => p.test(q));
    if (libraryHits.length > 0 && discoveryHit) {
      candidates.push({
        op: "discover",
        confidence: 0.85,
        reason: `library(${libraryHits[0]}) + discovery_phrase`
      });
    } else if (libraryHits.length > 0 && timeHit) {
      candidates.push({
        op: "search",
        confidence: 0.75,
        reason: `time_phrase + library(${libraryHits[0]}) → current state`
      });
      candidates.push({
        op: "docs",
        confidence: 0.7,
        reason: `library(${libraryHits[0]}) (alt: docs may also have it)`
      });
    } else if (libraryHits.length > 0) {
      candidates.push({ op: "docs", confidence: 0.85, reason: `library_hit(${libraryHits[0]})` });
    }
    if (discoveryHit && libraryHits.length === 0) {
      candidates.push({ op: "discover", confidence: 0.8, reason: "discovery_phrase" });
    }
    if (timeHit && libraryHits.length === 0) {
      candidates.push({ op: "search", confidence: 0.75, reason: "time_phrase" });
    }
    if (candidates.length === 0) {
      candidates.push({ op: "search", confidence: 0.4, reason: "default_fallback" });
    }
    candidates.sort((a, b) => b.confidence - a.confidence);
    const chosen = candidates[0];
    const strong = candidates.filter((c) => c.confidence >= 0.5);
    const uniqueOps = new Set(strong.map((c) => c.op));
    const ambiguous = uniqueOps.size > 1;
    const confidence = ambiguous ? Math.min(chosen.confidence, 0.5) : chosen.confidence;
    const why_not = candidates.slice(1).filter((c) => c.op !== chosen.op).map((c) => ({ op: c.op, reason: c.reason }));
    let budget = 1;
    if (ambiguous)
      budget = 2;
    if (context.prefer === "deep")
      budget = Math.max(budget, 3);
    if (context.budgetOverride != null)
      budget = context.budgetOverride;
    return {
      intent: OP_TO_INTENT[chosen.op],
      classifier_version: this.classifierVersion,
      recommended_op: chosen.op,
      recommended_provider: OP_TO_PROVIDER[chosen.op],
      confidence: round2(confidence),
      ambiguous,
      rationale: chosen.reason,
      rules_fired: candidates.map((c) => `${c.op}(${c.confidence.toFixed(2)}): ${c.reason}`),
      why_not,
      search_budget: budget
    };
  }
}

class LlmRouter {
  classifierVersion = "llm-haiku-v1";
  classify() {
    throw new Error("LlmRouter ships in v0.3. Use RuleRouter (default) for now.");
  }
}
function getRouter(name = "rule") {
  if (name === "rule")
    return new RuleRouter;
  if (name === "llm")
    return new LlmRouter;
  throw new Error(`unknown router: ${name} (use rule|llm)`);
}
function round2(n) {
  return Math.round(n * 100) / 100;
}

// src/ops/search.ts
var TIME_TO_TAVILY_DAYS = { day: 1, week: 7, month: 30, year: 365 };
var TIME_TO_BRAVE_FRESHNESS = { day: "pd", week: "pw", month: "pm", year: "py" };
async function run5(query, opts = {}) {
  const chain = filteredChain("web_facts");
  const max = opts.maxResults ?? 10;
  const tavilyAction = (provider) => provider.search(query, {
    maxResults: max,
    searchDepth: "basic",
    topic: opts.timeRange ? "news" : undefined,
    days: opts.timeRange ? TIME_TO_TAVILY_DAYS[opts.timeRange] : undefined,
    country: opts.country
  });
  const braveAction = (provider) => provider.search(query, {
    count: max,
    country: opts.country,
    freshness: opts.timeRange ? TIME_TO_BRAVE_FRESHNESS[opts.timeRange] : undefined
  });
  const ddgAction = (provider) => provider.search(query, { count: max });
  return await withCall("search", { provider: chain[0] ?? null, correlationId: opts.correlationId, noReceipt: opts.noReceipt }, async (receipt) => {
    Object.assign(receipt, queryFingerprint(query));
    receipt.params = { max_results: max, time_range: opts.timeRange ?? null, country: opts.country ?? null };
    const { active, result, fallback } = await runChain(chain, {
      tavily: tavilyAction,
      brave: braveAction,
      duckduckgo: ddgAction
    });
    receipt.fallback_chain = fallback;
    if (active === null || result === null) {
      receipt.status = "error";
      return await chainFailedPayload("search", fallback);
    }
    receipt.provider = active;
    const urls = result.map((r) => r.url);
    receipt.selected_urls = urls;
    receipt.results_count = result.length;
    receipt.selected_count = result.length;
    if (active !== chain[0])
      receipt.status = "degraded";
    return {
      ok: true,
      operation: "search",
      provider: active,
      query,
      results: result.map((r) => r.toJSON()),
      fallback_chain: fallback,
      status: active !== chain[0] ? "degraded" : "ok",
      returncode: 0
    };
  });
}

// src/ops/plan.ts
function shellQuote(s) {
  if (/^[\w\.\/:%@\-]+$/.test(s))
    return s;
  return `'${s.replace(/'/g, "'\\''")}'`;
}
function explain(query, opts = {}) {
  const router = getRouter(opts.routerName ?? "rule");
  const decision = router.classify(query, { prefer: opts.prefer, budgetOverride: opts.budgetOverride });
  return {
    ok: true,
    operation: "plan.explain",
    query,
    decision,
    would_run: `wsc ${decision.recommended_op} ${shellQuote(query)}`,
    returncode: 0
  };
}
async function run6(query, opts = {}) {
  const router = getRouter(opts.routerName ?? "rule");
  const decision = router.classify(query, {
    prefer: opts.prefer,
    budgetOverride: opts.budgetOverride
  });
  const correlationId = opts.correlationId ?? process.env.WSC_CORRELATION_ID;
  let subPayload;
  switch (decision.recommended_op) {
    case "docs":
      subPayload = await run3(query, { correlationId, noReceipt: opts.noReceipt });
      break;
    case "discover":
      subPayload = await run2(query, { correlationId, noReceipt: opts.noReceipt });
      break;
    case "fetch":
      subPayload = await run4(query, { correlationId, noReceipt: opts.noReceipt });
      break;
    case "crawl":
      subPayload = await run(query, { correlationId, noReceipt: opts.noReceipt });
      break;
    case "search":
      subPayload = await run5(query, { correlationId, noReceipt: opts.noReceipt });
      break;
    default:
      subPayload = {
        ok: false,
        operation: decision.recommended_op,
        error: `unknown op: ${decision.recommended_op}`,
        returncode: 2
      };
  }
  await withCall("plan", { provider: decision.recommended_provider, correlationId, noReceipt: opts.noReceipt }, async (receipt) => {
    receipt.route_decision = decision;
    receipt.dispatched_op = decision.recommended_op;
    receipt.sub_status = subPayload.status ?? (subPayload.ok ? "ok" : "error");
  });
  return {
    ok: !!subPayload.ok,
    operation: "plan",
    query,
    decision,
    dispatched_op: decision.recommended_op,
    result: subPayload,
    returncode: Number(subPayload.returncode ?? 0)
  };
}

// src/cli.ts
var VERSION = "0.2.0";
function resolveJson(opts) {
  if (opts.json)
    return true;
  if (process.env.WSC_JSON === "1")
    return true;
  return process.stdout && process.stdout.isTTY === false;
}
function emit(opts, payload) {
  if (resolveJson(opts)) {
    process.stdout.write(JSON.stringify(payload, null, 2) + `
`);
  } else {
    renderHuman(payload);
  }
  const rc = Number(payload.returncode ?? 0);
  process.exit(rc);
}
function renderHuman(payload) {
  const op = String(payload.operation ?? "");
  if (payload.ok === false && payload.error) {
    process.stderr.write(`${payload.error}
`);
  }
  if (op === "init") {
    const actions = payload.actions ?? [];
    if (actions.length === 0)
      console.log("(nothing to do)");
    else
      for (const a of actions)
        console.log(a);
    return;
  }
  if (op === "config.doctor") {
    renderDoctor(payload);
    return;
  }
  if (op === "config.disable" || op === "config.enable") {
    console.log(payload.message ?? "");
    return;
  }
  if (op === "receipts.tail") {
    const events = payload.events ?? [];
    if (events.length === 0) {
      console.log("(no audit events)");
      return;
    }
    for (const ev of events) {
      const ts = String(ev.ts ?? "?");
      const evOp = String(ev.op ?? "?").padEnd(14);
      const provider = String(ev.provider ?? "-").padEnd(11);
      const status = String(ev.status ?? "?").padEnd(9);
      const dur = String(ev.duration_ms ?? "?");
      const callId = String(ev.call_id ?? "").slice(0, 8);
      console.log(`${ts}  ${evOp}  ${provider}  ${status}  ${dur}ms  call=${callId}`);
    }
    return;
  }
  if (op === "receipts.summary") {
    renderReceiptsSummary(payload);
    return;
  }
  if (op === "plan.explain") {
    renderPlanExplain(payload);
    return;
  }
  process.stdout.write(JSON.stringify(payload, null, 2) + `
`);
}
function renderDoctor(payload) {
  const rows = payload.providers ?? [];
  console.log(`${"PROVIDER".padEnd(12)} ${"ROLE".padEnd(22)} ${"STATUS".padEnd(10)} KEY?  ENV`);
  console.log("-".repeat(78));
  for (const r of rows) {
    const envKeys = r.env_keys?.join(",") ?? "-";
    const has = r.has_key ? "yes" : "no ";
    console.log(`${String(r.provider).padEnd(12)} ${String(r.role).padEnd(22)} ${String(r.status).padEnd(10)} ${has.padEnd(4)}  ${envKeys || "-"}`);
  }
  const chains = payload.role_fallback_chains ?? {};
  if (Object.keys(chains).length > 0) {
    console.log(`
live fallback chains:`);
    for (const [role, chain] of Object.entries(chains)) {
      console.log(`  ${role.padEnd(22)} → ${chain.length > 0 ? chain.join(" → ") : "(none available)"}`);
    }
  }
  if (!payload.ok)
    process.stderr.write(`
hint: ${payload.hint ?? ""}
`);
}
function renderReceiptsSummary(payload) {
  console.log(`summary  scope=${payload.scope ?? "all"}  events=${payload.event_count ?? 0}`);
  for (const [label, key] of [
    ["by op", "by_op"],
    ["by provider", "by_provider"],
    ["by status", "by_status"]
  ]) {
    const d = payload[key] ?? {};
    if (Object.keys(d).length > 0) {
      console.log(`  ${label}:`);
      for (const [k, v] of Object.entries(d).sort(([, a], [, b]) => b - a)) {
        console.log(`    ${String(v).padStart(5)}  ${k}`);
      }
    }
  }
  if (payload.cost_units_total != null) {
    console.log(`  cost: ${payload.cost_units_total} units, ~$${payload.cost_usd_estimated_total ?? 0}`);
  }
  const byDomain = payload.by_domain ?? {};
  if (Object.keys(byDomain).length > 0) {
    console.log("  top domains:");
    for (const [host, n] of Object.entries(byDomain)) {
      console.log(`    ${String(n).padStart(5)}  ${host}`);
    }
  }
  const high = payload.high_confidence_events ?? [];
  if (high.length > 0)
    console.log(`  high-confidence events: ${high.length}`);
}
function renderPlanExplain(payload) {
  const d = payload.decision ?? {};
  console.log(`query: ${JSON.stringify(payload.query)}`);
  console.log(`intent:        ${d.intent ?? ""}`);
  console.log(`recommend op:  ${d.recommended_op ?? ""}  → provider ${d.recommended_provider ?? ""}`);
  console.log(`confidence:    ${d.confidence ?? ""}  (ambiguous=${d.ambiguous ?? false})`);
  console.log(`rationale:     ${d.rationale ?? ""}`);
  console.log(`search budget: ${d.search_budget ?? ""}`);
  const fired = d.rules_fired ?? [];
  if (fired.length > 0) {
    console.log("rules fired:");
    for (const line of fired)
      console.log(`  - ${line}`);
  }
  const why = d.why_not ?? [];
  if (why.length > 0) {
    console.log("why_not:");
    for (const w of why)
      console.log(`  - ${w.op}: ${w.reason}`);
  }
  console.log(`
would run: ${payload.would_run}`);
}
var program2 = new Command;
program2.name("wsc").description("Unified evidence-acquisition CLI across Context7, Exa, Tavily, Firecrawl, Brave, and DuckDuckGo.").version(VERSION, "-v, --version", "print version and exit").option("--json", "emit machine-readable JSON (auto-on when stdout is not a TTY or WSC_JSON=1)").option("--quiet", "suppress human-mode chatter").option("--no-receipt", "skip audit log write").option("--budget <n>", "override per-task search budget", (v) => Number.parseInt(v, 10));
function getGlobals() {
  return program2.opts();
}
program2.command("init").description("create config + state dirs and templates").option("--force", "overwrite existing keys.toml / budget.toml").option("--yes", "non-interactive (no prompts; v0.2 always non-interactive)").action((opts) => {
  emit(getGlobals(), { ...init({ force: !!opts.force }) });
});
var cfg = program2.command("config").description("provider availability and kill-switch");
cfg.command("doctor").description("show per-provider status and live fallback chains").option("--deep", "run minimal real probe per provider (v0.3)").action((opts) => {
  emit(getGlobals(), { ...doctor({ deep: !!opts.deep }) });
});
cfg.command("disable <provider>").description("kill-switch a provider until re-enabled").action((provider) => {
  disable(provider);
  emit(getGlobals(), {
    ok: true,
    operation: "config.disable",
    provider,
    message: `disabled ${provider} (run \`wsc config enable ${provider}\` to undo)`,
    returncode: 0
  });
});
cfg.command("enable <provider>").description("reverse `wsc config disable`").action((provider) => {
  const wasDisabled = enable(provider);
  emit(getGlobals(), {
    ok: true,
    operation: "config.enable",
    provider,
    message: wasDisabled ? `re-enabled ${provider}` : `${provider} was not disabled`,
    returncode: 0
  });
});
var rec = program2.command("receipts").description("audit log");
rec.command("tail").description("last N receipts").option("--lines <n>", "default 20", (v) => Number.parseInt(v, 10), 20).option("--tool <op>", "filter by op prefix (e.g. fetch, plan)").option("--provider <name>").option("--since <duration>", "duration like 15m, 2h, 7d").action(async (opts) => {
  const result = await tail({
    lines: opts.lines,
    op: opts.tool,
    provider: opts.provider,
    since: opts.since
  });
  emit(getGlobals(), result);
});
rec.command("summary").description("aggregated audit summary").option("--days <n>", "default 0 (all)", (v) => Number.parseInt(v, 10), 0).option("--by-domain", "aggregate by selected URL host").option("--cost", "aggregate cost_units / cost_usd_estimated").option("--high-confidence", "show events with multi_source_evidence ≥ 2").action(async (opts) => {
  const result = await summary({
    days: opts.days,
    byDomain: !!opts.byDomain,
    cost: !!opts.cost,
    highConfidence: !!opts.highConfidence
  });
  emit(getGlobals(), result);
});
program2.command("plan <query>").description("auto-route a query to the right tool").option("--explain", "show route decision without calling providers").addOption(new Option("--prefer <mode>", "fast|deep").choices(["fast", "deep"])).addOption(new Option("--router <name>", "rule|llm").choices(["rule", "llm"]).default("rule")).action(async (query, opts) => {
  const globals = getGlobals();
  if (opts.explain) {
    emit(globals, explain(query, { prefer: opts.prefer, budgetOverride: globals.budget, routerName: opts.router }));
  }
  const result = await run6(query, {
    prefer: opts.prefer,
    budgetOverride: globals.budget,
    routerName: opts.router,
    noReceipt: globals.noReceipt
  });
  emit(globals, result);
});
program2.command("docs <library>").description("fetch official library docs via Context7").option("--topic <topic>").option("--version <ver>").action(async (library, opts) => {
  const result = await run3(library, {
    topic: opts.topic,
    version: opts.version,
    noReceipt: getGlobals().noReceipt
  });
  emit(getGlobals(), result);
});
program2.command("discover <query>").description("semantic discovery via Exa").addOption(new Option("--type <kind>", "code|paper|company|people").choices(["code", "paper", "company", "people"])).option("--since <days>", "restrict to last N days", (v) => Number.parseInt(v, 10)).option("--num-results <n>", "default 10", (v) => Number.parseInt(v, 10), 10).action(async (query, opts) => {
  const result = await run2(query, {
    type: opts.type,
    sinceDays: opts.since,
    numResults: opts.numResults,
    noReceipt: getGlobals().noReceipt
  });
  emit(getGlobals(), result);
});
program2.command("fetch <url>").description("clean a known URL via Firecrawl").option("--format <fmt>", "markdown|html (repeatable)", (val, prev = []) => [...prev, val], []).option("--screenshot").action(async (url, opts) => {
  const result = await run4(url, {
    formats: opts.format && opts.format.length > 0 ? opts.format : undefined,
    screenshot: !!opts.screenshot,
    noReceipt: getGlobals().noReceipt
  });
  emit(getGlobals(), result);
});
program2.command("crawl <url>").description("crawl a site via Firecrawl (gated)").option("--max-pages <n>", "default 10", (v) => Number.parseInt(v, 10), 10).option("--include-paths <path>", "repeatable", (val, prev = []) => [...prev, val], []).option("--exclude-paths <path>", "repeatable", (val, prev = []) => [...prev, val], []).option("--format <fmt>", "repeatable", (val, prev = []) => [...prev, val], []).option("--apply", "required for crawls of 11–100 pages").option("--i-know-this-burns-credits", "required for crawls > 100 pages").action(async (url, opts) => {
  const result = await run(url, {
    maxPages: opts.maxPages,
    includePaths: opts.includePaths.length > 0 ? opts.includePaths : undefined,
    excludePaths: opts.excludePaths.length > 0 ? opts.excludePaths : undefined,
    formats: opts.format.length > 0 ? opts.format : undefined,
    apply: !!opts.apply,
    deepApply: !!opts.iKnowThisBurnsCredits,
    noReceipt: getGlobals().noReceipt
  });
  emit(getGlobals(), result);
});
program2.command("search <query>").description("general web search via Tavily").option("--max-results <n>", "default 10", (v) => Number.parseInt(v, 10), 10).addOption(new Option("--time <range>", "day|week|month|year").choices(["day", "week", "month", "year"])).option("--country <code>").action(async (query, opts) => {
  const result = await run5(query, {
    maxResults: opts.maxResults,
    timeRange: opts.time,
    country: opts.country,
    noReceipt: getGlobals().noReceipt
  });
  emit(getGlobals(), result);
});
program2.parseAsync().catch((err) => {
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  emit(getGlobals(), {
    ok: false,
    operation: "wsc",
    error: message,
    returncode: 1
  });
});
