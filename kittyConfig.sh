#!/bin/bash

# Define the path to the kitty.conf file
config_file="$HOME/.config/kitty/kitty.conf"

# Check if the kitty.conf file exists
if [ ! -f "$config_file" ]; then
    echo "Error: kitty.conf file not found at $config_file"
    exit 1
fi

# Add or modify the transparency setting
echo "background_opacity 0.9" >> "$config_file"

echo "Transparency setting added to kitty.conf. Restart Kitty for the changes to take effect."
