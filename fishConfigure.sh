# #!/usr/bin/env fish
# # This file is used to setup Fish

# #installing Fish
# sudo passwd $USER -d #removing passwd for EC2 instance

# sudo apt-add-repository ppa:fish-shell/release-3 
# sudo apt-get update && sudo apt-get upgrade
# sudo apt-get install fish

#Making fish default shell 
chsh -s $(which fish)

# OMF-INSTALLATION
curl https://raw.githubusercontent.com/oh-my-fish/oh-my-fish/master/bin/install > install
fish install --path=~/.local/share/omf --config=~/.config/omf

#Fisher- INSTALLATION
curl -sL https://raw.githubusercontent.com/jorgebucaran/fisher/main/functions/fisher.fish | source && fisher install jorgebucaran/fisher


# Fisher extensions
fisher install jorgebucaran/nvm.fish
fisher install jorgebucaran/replay.fish
fisher install franciscolourenco/done
fisher install gazorby/fish-abbreviation-tips
fisher install acomagu/fish-async-prompt
fisher install joseluisq/gitnow@2.11.0

#OMF-THEMES
omf install neolambda

#Aliasess
alias dog "code"; funcsave dog; 
alias dawg "code-insiders";funcsave dawg;
alias lss "ls -ah";funcsave lss;
alias rmf "rm -rf";funcsave rmf;

#configuring launch options
cd ~/.config/fish
rmf config.fish 
printf "if status is-interactive
    # Commands to run in interactive sessions can go here
    fastfetch
    export TERM=screen-256color
end" >> config.fish
cd ~


