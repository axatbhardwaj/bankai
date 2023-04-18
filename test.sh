#!/usr/bin/env fish
cd ~/.config/fish
rmf config.fish 
printf "if status is-interactive
    # Commands to run in interactive sessions can go here
    fastfetch
    export TERM=screen-256color
end" >> config.fish

