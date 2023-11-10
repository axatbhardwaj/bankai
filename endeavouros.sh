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

####------------------------------------------------------ installng software ------------------------------------------------------####

# install Fish
paru -S fish --noconfirm 
# Install Fastfetch
paru -S fastfetch-git --noconfirm
#Installing Bismuth for tiling
paru -S kwin-bismuth --noconfirm
#installing vs-code and vscode insiders
paru -S visual-studio-code-bin --noconfirm
#installing Forceblur
paru -S kwin-scripts-forceblur --noconfirm
#installing Brave
paru -S brave-bin --noconfirm
#installing floorp
paru -S floorp --noconfirm
#installing zip
paru -S zip --noconfirm
#installing Kitty
paru -S kitty --noconfirm           
#installing signal
paru -S signal-desktop --noconfirm
#installing thunderbird
paru -S thunderbird-bin --noconfirm
#installing noisetorch
paru -S noisetorch-bin --noconfirm
#installing steam
paru -S steam --noconfirm
#installing github-cli
paru -S github-cli --noconfirm
#installing nvm
paru -S nvm --noconfirm
#insalling authy
paru -S authy --noconfirm
#installing notion
paru -S notion-app-enhanced --noconfirm
#installing flatpak 
paru -S flatpak --noconfirm


##----------------------------------------------------FLATPAK INSTALLS------------------------------------------------------##

#adding remote repo for flatpak
flatpak remote-add --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo


#installing whatsapp
flatpak install flathub io.github.mimbrero.WhatsAppDesktop -y
#installing Discord
flatpak install flathub com.discordapp.Discord -y
#installing teams-for-linux
flatpak install flathub com.github.IsmaelMartinez.teams_for_linux -y
#installig spotify
flatpak install flathub com.spotify.Client -y


#updating system
paru -Syu --noconfirm

####--------------------------------------------------software instlled ----------------------------------------------------####

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

####------------------------------------ kitty and fish congiuration ends --------------------------------------------------####


####------------------------------------------------------ git config ------------------------------------------------------####
#creating directory for work and personal git

mkdir -p ~/work
cd ~/work
printf "# ~/work/.gitconfig.work
 
[user]
email = {work_email}
name = {work_username}
 
[github]
user = "{github_username}"
 
[core]
sshCommand = "ssh -i {ssh_key_path}"
" > ~/work/.gitconfig.work


mkdir -p ~/personal
cd ~/personal
printf "# ~/personal/.gitconfig.personal
 
[user]
email = {personal_email}
name = {personal_username}
 
[github]
user = "{github_username}"
 
[core]
sshCommand = "ssh -i {ssh_key_path}"
" > ~/personal/.gitconfig.personal

#creating a vscodeSsh config for remote ssh connections
printf "Host {HOSTNAME}
HostName
User 
IdentityFile " > ~/vsCodeSshConfig.config

#configuring global gitconfig
printf "# ~/.gitconfig

[includeIf "gitdir:~/personal/"]
    path =~/personal/.gitconfig.personal

[includeIf "gitdir:~/infrablok/"]
    path =~/work/.gitconfig.work

[core]
    excludesfile = ~/.gitignore
"> ~/.gitconfig
####--------------------------------------------------------git config ends------------------------------------------------------####




#####----------------------------------------------------Installing blurr------------------------------------------------------####
#configureing blurr
#only run this snippet if the argument provided is not y
if [ $1 != "y" ]
then

 git clone https://github.com/esjeon/kwin-forceblur.git
 cd kwin-forceblur
 chmod +x install.sh
 chmod +x pack.sh
 ./pack.sh
 ./install.sh

 mkdir -p ~/.local/share/kservices5/
 cp ~/.local/share/kwin/scripts/forceblur/metadata.desktop ~/.local/share/kservices5/forceblur.desktop
echo "Rember to enable blurr within kwin-scripts"
fi




echo "Fish installation complete! Restart your terminal to start using Fish."
