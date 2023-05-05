#!/bin/bash
set -e # Exit on error

# Check if running as root
if [[ $(id -u) -eq 0 ]]; then
  echo "Please do not run this script as root."
  exit 1
fi

# Update system and install required packages
sudo pacman -Syu --noconfirm git 

#installing fakeroot for makepkg
sudo pacman -S --noconfirm base-devel alpm

#updating 
sudo pacman -Syu



# Install Paru if not already installed
if ! command -v paru &> /dev/null; then
  echo "Paru not found. Installing Paru..."
  git clone https://aur.archlinux.org/paru.git /tmp/paru
  cd /tmp/paru
  sudo chown -R temp:temp $(pwd)
  makepkg -si --noconfirm --nocheck

  cd -
fi

# install Fish
paru -Syyu --noconfirm fish

# Make Fish the default shell 
chsh -s $(which fish)

# Install OMF
curl https://raw.githubusercontent.com/oh-my-fish/oh-my-fish/master/bin/install > install
fish -c " fish install --path=~/.local/share/omf --config=~/.config/omf --noninteractive --yes"

# Install Fisher
fish -c "curl -sL https://git.io/fisher | source && fisher install jorgebucaran/fisher"

# Install Fisher extensions
fish -c "fisher install jorgebucaran/nvm.fish"
fish -c "fisher install jorgebucaran/replay.fish"
fish -c "fisher install franciscolourenco/done"
fish -c "fisher install gazorby/fish-abbreviation-tips"
fish -c "fisher install acomagu/fish-async-prompt"
fish -c "fisher install joseluisq/gitnow@2.11.0"
fish -c "fisher install meaningful-ooo/sponge"

# Set aliases
fish -c 'alias dog "code"; funcsave dog;'
fish -c 'alias dawg "code-insiders"; funcsave dawg;'
fish -c 'alias lss "ls -a -h"; funcsave lss;'
fish -c 'alias rmf "rm -r -f"; funcsave rmf;'

# Configure launch options
echo 'if status is-interactive
    # Commands to run in interactive sessions can go here
    fastfetch
    export TERM=screen-256color
end' >> ~/.config/fish/config.fish

# Install Fastfetch
sudo pacman -S --noconfirm fastfetch

echo "Fish installation complete! Restart your terminal to start using Fish."
