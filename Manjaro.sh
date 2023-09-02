#!/bin/bash

# Function to install a package
install_package() {
    local package=$1
    paru -S --noconfirm $package
    if [ $? -ne 0 ]; then
        echo "Failed to install $package"
        exit 1
    fi
}

# Function to install fisher extension
install_fisher_extension() {
    local extension=$1
    fish -c "fisher install $extension"
    if [ $? -ne 0 ]; then
        echo "Failed to install fisher extension $extension"
        exit 1
    fi
}

# Install packages
install_package "fastfetch"
install_package "kwin-bismuth"
install_package "visual-studio-code-bin"
install_package "kwin-scripts-forceblur"
install_package "spotify"
install_package "brave-bin"
install_package "kitty"

# Install fisher extensions
install_fisher_extension "jorgebucaran/nvm.fish"
install_fisher_extension "jorgebucaran/replay.fish"
install_fisher_extension "franciscolourenco/done"
install_fisher_extension "gazorby/fish-abbreviation-tips"
install_fisher_extension "acomagu/fish-async-prompt"
install_fisher_extension "joseluisq/gitnow@2.11.0"
install_fisher_extension "meaningful-ooo/sponge"