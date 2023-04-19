#!/bin/bash
#updateing Arch 

#installing sudo 
pacman -S sudo

#upgrading system
sudo pacman -Syyu

#installing git
sudo pacman -S git 

#installing which 
pacman -S which 

#installing paru
sudo pacman -S --needed base-devel
git clone https://aur.archlinux.org/paru.git
cd paru
sudo makepkg -si
cd ..

#Installing fastfetch --arch
paru -S fastfetch
