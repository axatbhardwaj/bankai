#!/bin/bash
# This file is used to setup Manjro for my setup
#the commands for verbose and redundant for better calrity 

set -e  # Exit on error

#pacman updates & installing rust up
sudo pacman -Syyu base-devel --noconfirm

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
paru -S thunderbird --noconfirm
#installing noisetorch
paru -S noisetorch-bin --noconfirm
#installing github-cli
paru -S github-cli --noconfirm
#installing nvm
paru -S nvm --noconfirm
#insalling authy
paru -S authy --noconfirm
#installing notion
paru -S notion-app-electron --noconfirm
#installing flatpak 
paru -S flatpak --noconfirm
#installing bitwarden
paru -S bitwarden --noconfirm
#installing spotify
paru -S spotify-snapstore --noconfirm
#installing kde-partitionmanger
paru -S partitionmanager --noconfirm
#installing timeshift
paru -S timeshift --noconfirm
#installing timeshift-autosnap
paru -S timeshift-autosnap --noconfirm
#installing inotify
paru -S inotify-tools --noconfirm
#intsalling grub-btrfs
paru -S grub-btrfs --noconfirm
#installing grub-customizer
paru -S grub-customizer --noconfirm
#installing webcord
paru -S webcord --noconfirm
#installing whatsapp-for-linux
paru -S whatsdesk-bin --noconfirm
#installing teams-for-linux
paru -S teams-for-linux --noconfirm
#installing discord screen-audio
paru -S discord-screenaudio --noconfirm
#installing onlyoffice
paru -S onlyoffice-bin --noconfirm
#installing cursor
paru -S cursor-appimage --noconfirm


##----------------------------------------------------FLATPAK INSTALLS------------------------------------------------------##

#adding remote repo for flatpak
flatpak remote-add --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo


#installing Discord
flatpak install flathub com.discordapp.Discord -y
#installing discord-overlay 
flatpak install io.github.trigg.discover_overlay
#installing authy 
flatpak install flathub com.authy.Authy -y
#installing flatseal
flatpak install flathub com.github.tchx84.Flatseal -y


#fixing issue with dicord flatpak related to files
flatpak override --user --filesystem=home:ro com.discordapp.Discord


#####-------------------------------------- Grub fixes ------------------------------------------------#####

sudo grub-mkconfig -o /boot/grub/grub.cfg
sudo systemctl enable grub-btrfsd


#updating system
paru -Syyu --noconfirm

####---------------------------------------------configuring fish ------------------------------------------------------####

# Make Fish the default shell 
chsh -s $(which fish)

# Install Fisher
fish -c "curl -sL https://git.io/fisher | source && fisher install jorgebucaran/fisher"

#installing tide prompt
fish -c "fisher install IlanCosman/tide"

#configuring tide prmpt 
fish -c "tide configure --auto --style=Lean --prompt_colors='True color' --show_time='24-hour format' --lean_prompt_height='Two lines' --prompt_connection=Solid --prompt_connection_andor_frame_color=Darkest --prompt_spacing=Sparse --icons='Many icons' --transient=Yes"

# Install Fisher extensions
fish -c "fisher install jorgebucaran/nvm.fish"
fish -c "fisher install jorgebucaran/replay.fish"
fish -c "fisher install franciscolourenco/done"
fish -c "fisher install gazorby/fish-abbreviation-tips"
fish -c "fisher install meaningful-ooo/sponge"

# Set aliases
fish -c 'alias dog "code"; funcsave dog;' 
fish -c 'alias lss "ls -a -h"; funcsave lss;'
fish -c 'alias rmf "rm -r -f -v"; funcsave rmf;'
fish -c 'alias ps "ps auxfh"; funcsave ps;'
fish -c 'alias lss "ls -a -h"; funcsave lss;'
fish -c 'alias rmf "rm -r -f -v"; funcsave rmf;'
fish -c 'alias ps "ps auxfh"; funcsave ps;' 
fish -c 'function cursor; command cursor $argv > /dev/null 2>&1 &; end; funcsave cursor'



#### ----------------------- configuring cursor appimage ---------------------------------------- ####
chmod +x cursor-config.sh
./cursor-config.sh

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
# printf "background_opacity 0.5\n" >> "$config_file"

# printf "Transparency setting added to kitty.conf. Restart Kitty for the changes to take effect.\n"

#Configure launch options for fish
printf "if status is-interactive
    # Commands to run in interactive sessions can go here
    # fastfetch
    export TERM=screen-256color
    set -gx VIRTUAL_ENV_DISABLE_PROMPT 1
end\n" > ~/.config/fish/config.fish



####------------------------------------------------------ git config ------------------------------------------------------####

### configuring git 

# Function to prompt for user input
prompt_user() {
    read -p "$1: " user_input
    echo "$user_input"
}

# Function to generate Ed25519 SSH key
generate_ed25519_key() {
    ssh-keygen -t ed25519 -C "$1" -f "$2"
}

# Function to add SSH key to agent
add_ssh_to_agent() {
    ssh-add $1
}

# Start SSH agent
eval "$(ssh-agent -s)"

# Creating directory for work and personal git
mkdir -p ~/work
cd ~/work

# Prompt for work-related information
work_email=$(prompt_user "Enter work email")
work_username=$(prompt_user "Enter work username")
github_username=$(prompt_user "Enter GitHub username for work")

# Generate .gitconfig.work
cat <<EOF > ~/work/.gitconfig.work
[user]
email = $work_email
name = $work_username

[github]
user = "$github_username"

[core]
sshCommand = "ssh -i ~/.ssh/work_key"
EOF

# Generate Ed25519 SSH key for work
generate_ed25519_key "$work_email" ~/.ssh/work_key

# Add SSH key to agent
add_ssh_to_agent ~/.ssh/work_key

# Repeat the process for personal
mkdir -p ~/personal
cd ~/personal

personal_email=$(prompt_user "Enter personal email")
personal_username=$(prompt_user "Enter personal username")
github_username=$(prompt_user "Enter GitHub username for personal")

# Generate .gitconfig.personal
cat <<EOF > ~/personal/.gitconfig.personal
[user]
email = $personal_email
name = $personal_username

[github]
user = "$github_username"

[core]
sshCommand = "ssh -i ~/.ssh/personal_key"
EOF

# Generate Ed25519 SSH key for personal
generate_ed25519_key "$personal_email" ~/.ssh/personal_key

# Add SSH key to agent
add_ssh_to_agent ~/.ssh/personal_key

# Configure global gitconfig
cat <<EOF > ~/.gitconfig
[includeIf "gitdir:~/personal/"]
    path = ~/personal/.gitconfig.personal

[includeIf "gitdir:~/work/"]
    path = ~/work/.gitconfig.work

[core]
    excludesfile = ~/.gitignore
EOF


echo "CAT the .pub files and add the contents to Github.com in their respective accounts"

####---------------------------KDE-connect fix----------------------------------####
killall kdeconnectd
mv ~/.config/kdeconnect ~/.config/kdeconnect.bak

sudo firewall-cmd --permanent --zone=public --add-service=kdeconnect
sudo firewall-cmd --reload

#####----------------------------------------------------Installing blurr------------------------------------------------------####
# Prompt for desktop environment
read -p "Is your desktop environment KDE? (y/n): " is_kde

if [ "$is_kde" = "y" ]; then
        git clone https://github.com/esjeon/kwin-forceblur.git
        cd kwin-forceblur
        chmod +x install.sh
        chmod +x pack.sh
        ./pack.sh
        ./install.sh

        mkdir -p ~/.local/share/kservices5/
        cp ~/.local/share/kwin/scripts/forceblur/metadata.desktop ~/.local/share/kservices5/forceblur.desktop
        echo "Remember to enable blurr within kwin-scripts"
else
    echo "Skipping kwin-forceblur installation as the desktop environment is not KDE."
fi

#promt for gameing 
read -p "Do you want to to configure this machine for gaming ? (y/n): " game_on

if [ "$game_on"="y" ]; then
    #installing steam
    paru -S steam --noconfirm
    #installing lutris
    paru -S lutris --noconfirm
    #installing protonup for proton-GE
    paru -S protonup-rs-bin --noconfirm
    #installing protontricks
    paru -S protontricks --noconfirm
    #installing gamemode
    paru -S gamemode --noconfirm
    #installing plasma-gamemode-integration
    paru -S plasma-gamemode-git --noconfirm
    #installing goverlay 
    paru -S goverlay --noconfirm
    #installing nvtop
    paru -S nvtop --noconfirm
    #installing btop
    paru -S btop --noconfirm
    #installing nvidia settings
    paru -S nvidia-settings --noconfirm
    #installing nvdock for nvsettings
    paru -S nvdock-git --noconfirm

    #updating system before installing zen-kernel
    paru -Syyu --noconfirm

    #installing zen-kernel
    paru -S zen-kernel linux-zen-headers --noconfirm

    #making grub entry for zen-kernel
    sudo grub-mkconfig -o /boot/grub/grub.cfg    

    echo "Games-configurations completed !
    launch steam and lutris then run:
    protonup-rs -q 
    "
fi

#ask if to enable bluetooth
read -p "Do you want to enable bluetooth ? (y/n): " bt_on

if [ "$bt_on"="y" ]; then
    #enable bluetooth
    sudo systemctl enable bluetooth
    sudo systemctl start bluetooth
    echo "Bluetooth enabled !"
fi

echo "installation complete! Restart your terminal"
