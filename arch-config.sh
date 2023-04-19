#!/bin/bash

#installing sudo 
pacman -S sudo

#upgrading system
sudo pacman -Syyu

#installing git
sudo pacman -S git 

#pacman base-devel
sudo pacman -S --needed base-devel

#installing which 
pacman -S which 

#adding and switching to new users
useradd  test
passwd -d test
su test

#installing paru
git clone https://aur.archlinux.org/paru.git
cd paru
sudo makepkg -si
exit

#deleting user 
userdel test

#Installing fastfetch --arch
paru -S fastfetch

