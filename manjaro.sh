#!/bin/bash
# This file is used to setup Manjro for my setup
#the commands for verbose and redundant for better calrity 

set -e  # Exit on error

#do pacman updates & installing rust up
sudo pacman -Syu base-devel --noconfirm

#installing rust with rustup
#!/bin/bash

curl https://sh.rustup.rs -sSf | sh -s -- -y --profile default --default-toolchain stable
source $HOME/.cargo/env


# Install Paru if not already installed
if ! command -v paru &> /dev/null
then
    echo "Paru not found. Installing Paru..."
    git clone https://aur.archlinux.org/paru.git /tmp/paru
    cd /tmp/paru
    makepkg -si --noconfirm
fi


#installing amethyst
paru -S ame --noconfirm


####------------------------------------------------------ installng software ------------------------------------------------------####

# install Fish
ame -S fish --noconfirm 
# Install Fastfetch
ame -S fastfetch --noconfirm
#Installing Bismuth for tiling
ame -S kwin-bismuth --noconfirm
#installing vs-code and vscode insiders
ame -S visual-studio-code-bin --noconfirm
#installing Forceblur
ame -S kwin-scripts-forceblur --noconfirm
#Installing spotify 
ame -S spotify --noconfirm
#installing Brave
ame -S brave-bin --noconfirm
#installing Kitty
ame -S kitty --noconfirm              

#updating system
ame --noconfirm

# Make Fish the default shell 
chsh -s $(which fish)

# Install OMF
curl https://raw.githubusercontent.com/oh-my-fish/oh-my-fish/master/bin/install > install
fish -c " fish install --path=~/.local/share/omf --config=~/.config/omf --noninteractive --yes"

# Install OMF themes
fish -c "omf install neolambda"

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
fish -c 'alias lss "ls -a -h"; funcsave lss;'
fish -c 'alias rmf "rm -r -f"; funcsave rmf;'
fish -c 'alias ps "ps auxfh"; funcsave ps;' 

#### ----------------------- configuring kitty and Fish launch ---------------------------------------- ####

# Configure kitty config

# Define the path to the kitty.conf file
config_file="$HOME/.config/kitty/kitty.conf"

# Check if the kitty.conf file exists
if [ ! -f "$config_file" ]; then
    mkdir -p "$HOME/.config/kitty"
    touch "$config_file"
fi

# Add or modify the transparency setting
printf "background_opacity 0.5\n" >> "$config_file"

printf "Transparency setting added to kitty.conf. Restart Kitty for the changes to take effect.\n"



#Configure launch options for fish
printf "if status is-interactive
    # Commands to run in interactive sessions can go here
    fastfetch
    export TERM=screen-256color
    set -gx VIRTUAL_ENV_DISABLE_PROMPT 1
end\n" > ~/.config/fish/config.fish


#configureing blurr

 git clone https://github.com/esjeon/kwin-forceblur.git
 cd kwin-forceblur
 chmod +x install.sh
 chmod +x pack.sh
 ./pack.sh
 ./install.sh

 mkdir -p ~/.local/share/kservices5/
 cp ~/.local/share/kwin/scripts/forceblur/metadata.desktop ~/.local/share/kservices5/forceblur.desktop


echo "Fish installation complete! Restart your terminal to start using Fish."
echo "Rember to enable blurr within kwin-scripts"
