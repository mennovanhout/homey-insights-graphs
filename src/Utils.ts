export const generateId  = (): string => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;

    let result = '';
    let counter = 0;

    while (counter < 30) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
        counter += 1;
    }

    return result;
}

export const backgroundColor = (arg: string): string => {
    switch (arg) {
        case 'darkmode':
            return '#1E1E1EFF';
        case 'lightmode':
            return '#ffffff';
        default:
            return 'transparent';
    }
}
