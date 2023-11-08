#!/bin/bash
# This file is used to setup Nobara Linux for my setup

set -e  # Exit on error

# Update system and install necessary packages
nobara-sync

# Install Rust using rustup
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile default --default-toolchain stable
source $HOME/.cargo/env

#adding repo for cs-code 
sudo rpm --import https://packages.microsoft.com/keys/microsoft.asc
sudo sh -c 'echo -e "[code]\nname=Visual Studio Code\nbaseurl=https://packages.microsoft.com/yumrepos/vscode\nenabled=1\ngpgcheck=1\ngpgkey=https://packages.microsoft.com/keys/microsoft.asc" > /etc/yum.repos.d/vscode.repo'

#adding gh-cli repo
sudo dnf install 'dnf-command(config-manager)'
sudo dnf config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo


# Install software using dnf (Fedora's package manager)
sudo dnf install -y fish fastfetch code zip kitty thunderbird gh 

# Install Flatpak apps
flatpak install flathub io.github.mimbrero.WhatsAppDesktop -y
flatpak install flathub com.discordapp.Discord -y
flatpak install flathub com.github.IsmaelMartinez.teams_for_linux -y
flatpak install flathub com.spotify.Client -y
flatpak install flathub one.ablaze.floorp -y
flatpak install flathub org.signal.Signal -y
flatpak install flathub com.authy.Authy -y


# Make Fish the default shell k
chsh -s $(which fish)

# Install OMF and themes
curl https://raw.githubusercontent.com/oh-my-fish/oh-my-fish/master/bin/install > install
fish -c "fish install --path=~/.local/share/omf --config=~/.config/omf --noninteractive --yes"
fish -c "omf install neolambda"

# Install Fisher and extensions
fish -c "curl -sL https://git.io/fisher | source && fisher install jorgebucaran/fisher"
fish -c "fisher install jorgebucaran/nvm.fish"
fish -c "fisher install jorgebucaran/replay.fish"
fish -c "fisher install franciscolourenco/done"
fish -c "fisher install gazorby/fish-abbreviation-tips"
fish -c "fisher install acomagu/fish-async-prompt"
fish -c "fisher install joseluisq/gitnow@2.11.0"
fish -c "fisher install meaningful-ooo/sponge"

# Set aliases
fish -c 'alias dog "code"; funcsave dog;' 
fish -c 'alias lss "ls -a -h"; funcsave lss;'
fish -c 'alias rmf "rm -r -f"; funcsave rmf;'
fish -c 'alias ps "ps auxfh"; funcsave ps;' 

# Configure kitty
config_file="$HOME/.config/kitty/kitty.conf"
if [ ! -f "$config_file" ]; then
    mkdir -p "$HOME/.config/kitty"
    touch "$config_file"
fi
printf "background_opacity 0.75\n" >> "$config_file"
printf "Transparency setting added to kitty.conf. Restart Kitty for the changes to take effect.\n"

# Configure Fish launch options
printf "if status is-interactive
    fastfetch
    export TERM=screen-256color
    set -gx VIRTUAL_ENV_DISABLE_PROMPT 1
end\n" > ~/.config/fish/config.fish

# Additional configurations...

echo "Nobara Linux setup complete! Restart your terminal to start using Fish."
