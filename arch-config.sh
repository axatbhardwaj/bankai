#!/bin/bash
#updateing Arch 
sudo pacman -Syyu

#installing git
sudo pacman -S git 

#installing which 
pacman -S which 

#installing paru
sudo pacman -S --needed base-devel
git clone https://aur.archlinux.org/paru.git
cd paru
makepkg -si
cd ..

#Installing fastfetch --arch
paru -S fastfetch
