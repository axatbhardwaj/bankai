#!/bin/bash

# Set the path to the AppImage
cursor_app="/opt/appimages/cursor.AppImage"

# Check if the AppImage exists
if [ ! -f "$cursor_app" ]; then
    echo "Error: cursor.AppImage not found at $cursor_app"
    exit 1
fi

# Make the AppImage executable
chmod +x "$cursor_app"

# Create a symbolic link
sudo ln -sf "$cursor_app" /usr/local/bin/cursor

echo "Symbolic link created: /usr/local/bin/cursor"
echo "You can now use 'cursor' command to run the text editor."

exit 0