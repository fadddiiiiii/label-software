import sys
from unittest.mock import MagicMock

# Create a mock for win32print
win32print_mock = MagicMock()
win32print_mock.PRINTER_ALL_ACCESS = 987654
win32print_mock.FORM_USER = 0
sys.modules['win32print'] = win32print_mock

from omg.print.win_dispatcher import Win32PrintDispatcher

def test_add_form():
    dispatcher = Win32PrintDispatcher()
    
    # Mock opening the printer
    win32print_mock.OpenPrinter.return_value = "MOCK_HANDLE"
    
    # Call the method
    form_name = dispatcher._register_custom_form(
        handle="OLD_HANDLE", 
        printer_name="Test Printer", 
        width_mm=100.0, 
        height_mm=40.0
    )
    
    print("Returned Form Name:", form_name)
    
    print("\nCalls to OpenPrinter:")
    for call in win32print_mock.OpenPrinter.call_args_list:
        print(call)
        
    print("\nCalls to DeleteForm:")
    for call in win32print_mock.DeleteForm.call_args_list:
        print(call)
        
    print("\nCalls to AddForm:")
    for call in win32print_mock.AddForm.call_args_list:
        print(call)
        
    print("\nCalls to ClosePrinter:")
    for call in win32print_mock.ClosePrinter.call_args_list:
        print(call)

if __name__ == "__main__":
    test_add_form()
