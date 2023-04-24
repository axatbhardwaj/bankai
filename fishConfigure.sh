#!/bin/bash
# This file is used to setup Fish

Making fish default shell 
chsh -s $(which fish)

# OMF-INSTALLATION
curl https://raw.githubusercontent.com/oh-my-fish/oh-my-fish/master/bin/install > install
fish install --path=~/.local/share/omf --config=~/.config/omf

#OMF-THEMES
omf install neolambda

#Fisher- INSTALLATION
curl -sL https://raw.githubusercontent.com/jorgebucaran/fisher/main/functions/fisher.fish | source && fisher install jorgebucaran/fisher


# Fisher extensions
fish -c "fisher install jorgebucaran/nvm.fish"
fish -c "fisher install jorgebucaran/replay.fish"
fish -c "fisher install franciscolourenco/done"
fish -c "fisher install gazorby/fish-abbreviation-tips"
fish -c "fisher install acomagu/fish-async-prompt"
fish -c "fisher install joseluisq/gitnow@2.11.0"
fish -c "fisher install meaningful-ooo/sponge"

#Aliasess
fish -c "alias dog "code"; funcsave dog;" 
fish -c "alias dawg "code-insiders";funcsave dawg;"
fish -c "alias lss "ls -ah";funcsave lss;"
fish -c "alias rmf "rm -rf";funcsave rmf;"

#configuring launch options
cd ~/.config/fish
rmf config.fish 
printf "if status is-interactive
    # Commands to run in interactive sessions can go here
    fastfetch
    export TERM=screen-256color
end" >> config.fish
cd ~