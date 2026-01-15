---
title: Overview
icon: fa-solid fa-home
---

# UniConsole

## Version Details
- Recommended Unity Version: 2022.3.41f1

## What?
`UniConsole` is a basic debugging console for unity inspired by [QuantumConsole](https://assetstore.unity.com/packages/tools/utilities/quantum-console-211046).
It is designed to be a free alternative with less features.

## Why?
I needed an Admin Console for the Unity Scene View.
[Setup](/setup/setup.md)
## Planned features
- [ ] Optional parameter support
- [x] Fix collection parameters
- [ ] Add better parsing support
- [x] Customization

## Installation

Are you already familiar with Unity (and Github) and are looking for a quick way to install this project? Check out the [Advanced installation guide](AdvancedInstall.md).

Are you new to Unity and/or Github and are looking for a detailed, beginner friendly guide? Try the [Beginner installation guide](BeginnerInstall.md).

## Version History

Click [here](Releases.md) to view the Version History and the Patch Notes of `UniConsole`.

## Commands

> [!IMPORTANT]
> Only **static** methods can be used as commands

The default commands for `UniConsole` are:
- `help`: Logs every available command (default and custom)
- `help otherCmd`: Logs a help text for the command `otherCmd` if provided.
  You can provide a help text for your custom commands like so:
    ```cs
    [Command("This is the help text for my command")]
    public static void MyCommand() {
        // Do something
    }
    ```
- `clear`: Clear the console
- `exit`: Exits the application using `Application.Quit()`

## Examples

There aren't a lot of examples, that are useful for learning to use `UniConsole`. Here is a very simple script to showcase the most basic of UniConsole commands.

```cs
// Some very simple math commands
public class MathCommands {
    [Command("Adds two decimal numbers")]
    public static decimal Add(decimal a, decimal b) {
        return a + b;
    }

    [Command("Squares a decimal number")]
    public static decimal Square(decimal d) {
        return d * d;
    }

    [Command("Takes the square root of a decimal number")]
    public static decimal Sqrt(decimal d) {
        return Mathf.Pow(d, 0.5);
    }
}

// Small class that does something
public class Something {
    [Command("Greets someone")]
    public static string Greet(string name) {
        return $"Hello, {name}!";
    }
}
```

## In-Depth Explanation of Classes

### UniConsole
`UniConsole` represents and manages an Instance of the Console in the Scene.
The class provides **event callbacks** for important events such as
- `OnCommandSubmitAttempted`: When the user tries to submit a command through the input field
- `OnCommandSubmitted`: When the submitted command was valid and has been correctly executed
- `OnTerminalCleared`: When the terminal was cleared using the `clear` command.

The class uses **private utility methods** to
- Handle submission to the input field
- Execute and validate commands
- Parse parameters to the target types
- Handle autocompletion of commands
- Keep track of a command history and cycle through

### Reflector
The `Reflector` is a **utility class** that is used to fetch the commands from the assembly. The commands can be accessed using the `Commands` Property.
The `Commands` Property returns an array of [TerminalCommand](#terminalcommand)s.
The `Classes` Property returns an array of `Types`. It contains every class that has a `Command` Attribute inside.
```cs
// Access the commands
// If the commands are not initialized, the cache will update automatically
TerminalCommand[] commands = Reflector.Commands;

// Access the classes that have commands
// If the commands are not initialized, the cache will update automatically
Type[] classes = Reflector.Classes;

// Manually update the command cache
Reflector.UpdateCommandCache();
```

### TerminalCommand
The `TerminalCommand` class holds all the **data** of a command.
The class allows you to access:
- The `MethodInfo` of the command
- The **Class** the command is in (represented as a `Type`)
- If the command is **ambiguous** with any other command (same method name)
- The **Name** of the command
- The **Full Name** of the command (ClassName + MethodName)
- The **Command Name** (automatic unambiguous name). It decides if it should include the class name based on **ambiguity**
- **Autocomplete** options for classes and methods


### CommandAttribute
The `Command` Attribute is used to mark a method as a command.

> [!IMPORTANT]
> Only **static** methods can be used as commands

The `Command` Attribute is also used to give your commands a description that will be shown as a help text.
```cs
[Command("This is a description")] // Mark your method as a command
public static void MyCommand() // Declare your method
{ 
    // do something
}
```
> [!DANGER]
> You can use **any number** of parameters and **any** return type for your command.
> Just make sure you can convert your return value to a string.
```cs
[Command("This is a description")]
public static decimal Pow(decimal b, decimal exp, bool multiplyByTen) {
    decimal result = Mathf.Pow(b exp);
    if (multiplyByTen) {
        result *= 10M;
    }

    return result;
}
```

### LogType
`LogType` is an enum that represents the different Types of messages that can be logged to the console.

It looks like this:
```cs
public enum LogType {
    Message, Warning, Error
}
```

The `Message` type is the default for any message. It prints in the normal **white** color.
The `Warning` type is used to log warnings. It prints in a **yellow** color.
The `Error` type is used to log errors. It prints in a **red** color.

> [!CAUTION]
> Be careful when using complex types as parameters.

> [!TIP]
> You can create your own custom commands by creating static methods and marking them with the `Command

> [!IMPORTANT]
> Only **static** methods can be used as commands

> [!WARNING]
> Using complex types as parameters can lead to unexpected behavior.

> [!NOTE]
> Make sure to test your commands thoroughly when using complex types.

> [!DANGER]
> You can use **any number** of parameters and **any** return type for your command
