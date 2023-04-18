#!/usr/bin/env fish
# This file is used to setup aliases for my shell
alias dog "code"; funcsave dog; 
alias dawg "code-insiders";funcsave dawg;
alias lss "ls -ah";funcsave lss;
alias rmf "rm -rf";funcsave rmf;

#Fisher- INSTALLATION
curl -sL https://raw.githubusercontent.com/jorgebucaran/fisher/main/functions/fisher.fish | source && fisher install jorgebucaran/fisher

# Fisher extensions
fisher install jorgebucaran/nvm.fish
fisher install jorgebucaran/replay.fish
fisher install franciscolourenco/done
fisher install gazorby/fish-abbreviation-tips
fisher install acomagu/fish-async-prompt
fisher install joseluisq/gitnow@2.11.0

# OMF-INSTALLATION
git clone https://github.com/oh-my-fish/oh-my-fish
cd oh-my-fish
bin/install --offline

#OMF-THEMES
omf install neolambda

#installing paru
sudo pacman -S --needed base-devel
git clone https://aur.archlinux.org/paru.git
cd paru
makepkg -si

#Installing fastfetch --arch
paru -S fastfetch

#configuring for kitty and Fastfetch
cd ~/.config/fish
rmf config.fish 
printf "if status is-interactive
    # Commands to run in interactive sessions can go here
    fastfetch
    export TERM=screen-256color
end" >> config.fish


