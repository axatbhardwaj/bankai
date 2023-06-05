#!/bin/bash

config_file="/etc/pacman.conf"

# Check if the Paru configuration file exists
if [[ ! -f $config_file ]]; then
    echo "Paru configuration file not found. Make sure Paru is installed and configured."
    exit 1
fi

# Check if the 'color' option is already set to 'always'
if grep -q "color = always" "$config_file"; then
    echo "Colors are already enabled in Paru."
    exit 0
fi

# Add 'color = always' to the Paru configuration file
tmp_file=$(mktemp)
sed '/^#\[options\]/a color = always' "$config_file" > "$tmp_file"
mv "$tmp_file" "$config_file"

echo "Colors enabled in Paru."

# Restart Paru, if it is currently running
paru_pid=$(pgrep paru)
if [[ -n $paru_pid ]]; then
    echo "Restarting Paru..."
    kill "$paru_pid"
    paru -Syu &
    echo "Paru restarted."
fi
