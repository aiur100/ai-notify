# Slack Block Kit Documentation

This document provides a reference for Slack Block Kit blocks, which are components that can be combined to create visually rich and interactive messages in Slack.

You can include up to 50 blocks in each message, and 100 blocks in modals or Home tabs.

## Table of Contents

- [Actions Block](#actions-block)
- [Context Block](#context-block)
- [Divider Block](#divider-block)
- [File Block](#file-block)
- [Header Block](#header-block)
- [Image Block](#image-block)
- [Input Block](#input-block)
- [Markdown Block](#markdown-block)
- [Section Block](#section-block)

## Actions Block

The Actions block holds multiple interactive elements.

### Fields

- `type` - Must be set to `"actions"`.
- `elements` - An array of interactive element objects (buttons, select menus, overflow menus, date pickers, etc.).
- `block_id` (optional) - A string that identifies the source of the action.

### Example

```json
{
  "type": "actions",
  "block_id": "actions1",
  "elements": [
    {
      "type": "static_select",
      "placeholder": {
        "type": "plain_text",
        "text": "Which witch is the witchiest witch?"
      },
      "action_id": "select_2",
      "options": [
        {
          "text": {
            "type": "plain_text",
            "text": "Matilda"
          },
          "value": "matilda"
        },
        {
          "text": {
            "type": "plain_text",
            "text": "Glinda"
          },
          "value": "glinda"
        },
        {
          "text": {
            "type": "plain_text",
            "text": "Granny Weatherwax"
          },
          "value": "grannyWeatherwax"
        },
        {
          "text": {
            "type": "plain_text",
            "text": "Hermione"
          },
          "value": "hermione"
        }
      ]
    },
    {
      "type": "button",
      "text": {
        "type": "plain_text",
        "text": "Cancel"
      },
      "value": "cancel",
      "action_id": "button_1"
    }
  ]
}
```

## Context Block

The Context block displays contextual information, which can include both images and text.

### Fields

- `type` - Must be set to `"context"`.
- `elements` - An array of image elements and text objects.
- `block_id` (optional) - A string acting as a unique identifier for this block.

### Example

```json
{
  "type": "context",
  "elements": [
    {
      "type": "image",
      "image_url": "https://image.freepik.com/free-photo/red-drawing-pin_1156-445.jpg",
      "alt_text": "images"
    },
    {
      "type": "mrkdwn",
      "text": "Location: **Dogpatch**"
    }
  ]
}
```

## Divider Block

The Divider block visually separates pieces of information inside a message, similar to an HTML `<hr>` element.

### Fields

- `type` - Must be set to `"divider"`.
- `block_id` (optional) - A string acting as a unique identifier for this block.

### Example

```json
{
  "type": "divider"
}
```

## File Block

The File block is used to display a file that has been uploaded to Slack.

### Fields

- `type` - Must be set to `"file"`.
- `external_id` - The external ID for the file.
- `source` - The source of the file, must be "remote".
- `block_id` (optional) - A string acting as a unique identifier for this block.

## Header Block

The Header block displays a larger-sized text block. Use it to delineate between different groups of content in your app's surfaces.

### Fields

- `type` - Must be set to `"header"`.
- `text` - A plain_text text object with the text to be displayed.
- `block_id` (optional) - A string acting as a unique identifier for this block.

### Example

```json
{
  "type": "header",
  "text": {
    "type": "plain_text",
    "text": "A Heartfelt Header"
  }
}
```

## Image Block

The Image block displays an image. Supported file types include png, jpg, jpeg, and gif.

### Fields

- `type` - Must be set to `"image"`.
- `image_url` - The URL of the image to be displayed.
- `alt_text` - A plain text summary of the image.
- `title` (optional) - A plain_text object with a title to be shown above the image.
- `block_id` (optional) - A string acting as a unique identifier for this block.

### Example

```json
{
  "type": "image",
  "title": {
    "type": "plain_text",
    "text": "Please enjoy this photo of a kitten"
  },
  "block_id": "image4",
  "image_url": "http://placekitten.com/500/500",
  "alt_text": "An incredibly cute kitten."
}
```

## Input Block

The Input block collects information from users via block elements.

### Fields

- `type` - Must be set to `"input"`.
- `label` - A text object that defines the label shown above the input element.
- `element` - An interactive element that collects user input.
- `dispatch_action` (optional) - A boolean that indicates whether the input should dispatch a block_actions payload when the element has been interacted with.
- `block_id` (optional) - A string acting as a unique identifier for this block.
- `hint` (optional) - A text object that defines hint text shown below the input.
- `optional` (optional) - A boolean that indicates whether the input is optional.

### Example

```json
{
  "type": "input",
  "element": {
    "type": "plain_text_input"
  },
  "label": {
    "type": "plain_text",
    "text": "Label",
    "emoji": true
  }
}
```

## Markdown Block

The Markdown block is used to display formatted text using Slack's markdown-like syntax.

### Fields

- `type` - Must be set to `"mrkdwn"`.
- `text` - The text content to display, using Slack's markdown syntax.
- `verbatim` (optional) - When set to true, markdown parsing will be skipped.

## Section Block

The Section block is one of the most flexible blocks available. It can be used to display text, fields, and accessory elements like buttons or images.

### Fields

- `type` - Must be set to `"section"`.
- `text` (optional) - A text object that defines the main text content.
- `fields` (optional) - An array of text objects to be displayed in a compact format.
- `accessory` (optional) - A block element that sits to the right of the text/fields.
- `block_id` (optional) - A string acting as a unique identifier for this block.

### Example

```json
{
  "type": "section",
  "text": {
    "type": "mrkdwn",
    "text": "This is a section block with a button."
  },
  "accessory": {
    "type": "button",
    "text": {
      "type": "plain_text",
      "text": "Click Me"
    },
    "action_id": "button_click"
  }
}
```

## Using Block Kit in Your Webhook Handler

When formatting messages for Slack in your webhook handler:

1. Construct your message as a JSON object with an array of blocks
2. Each block should follow the structure outlined in this documentation
3. Use the appropriate block types to create rich, interactive messages
4. Remember that you can include up to 50 blocks in a single message

For more detailed information and interactive examples, visit the [Block Kit Builder](https://app.slack.com/block-kit-builder/).
