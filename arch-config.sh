#!/bin/bash
# This file is used to setup Fish

# Add sudo if not already running as root
if [ "$EUID" -ne 0 ]
  then sudo "$0" "$@"
  exit
fi

# Create a temporary user to run the installation
useradd -m -s /bin/bash tempuser
echo "tempuser ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Install Fish
sudo -u tempuser bash -c "yay -Sy fish --noconfirm"
chsh -s $(which fish) tempuser

# Install Paru
sudo -u tempuser bash -c "git clone https://aur.archlinux.org/paru.git && cd paru && makepkg -si --noconfirm"
rm -rf /home/tempuser/paru

# OMF installation
sudo -u tempuser fish -c "curl -sL https://get.oh-my.fish | fish && omf install neolambda"

# Fisher installation
sudo -u tempuser fish -c "curl -sL https://git.io/fisher | source && fisher install jorgebucaran/fisher"

# Fisher extensions
sudo -u tempuser fish -c "fisher install jorgebucaran/nvm.fish"
sudo -u tempuser fish -c "fisher install jorgebucaran/replay.fish"
sudo -u tempuser fish -c "fisher install franciscolourenco/done"
sudo -u tempuser fish -c "fisher install gazorby/fish-abbreviation-tips"
sudo -u tempuser fish -c "fisher install acomagu/fish-async-prompt"
sudo -u tempuser fish -c "fisher install joseluisq/gitnow@2.11.0"
sudo -u tempuser fish -c "fisher install meaningful-ooo/sponge"

# Aliases
sudo -u tempuser fish -c "alias dog \"code\"; funcsave dog;"
sudo -u tempuser fish -c "alias dawg \"code-insiders\"; funcsave dawg;"
sudo -u tempuser fish -c "alias lss \"ls -a -h\"; funcsave lss;"
sudo -u tempuser fish -c "alias rmf \"rm -r -f\"; funcsave rmf;"

# Configuring launch options
sudo -u tempuser bash -c "mkdir -p /home/tempuser/.config/fish"
sudo -u tempuser bash -c "echo \"if status is-interactive
  # Commands to run in interactive sessions can go here
  fastfetch
  export TERM=screen-256color
end\" > /home/tempuser/.config/fish/config.fish"

# Cleanup
deluser tempuser
rm /etc/sudoers.d/tempuser
