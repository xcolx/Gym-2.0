//
//  GeometryReaderBarView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 04.09.2024.
//

import SwiftUI

struct GeometryReaderBarView: View {
    
    @State var percentage: Double
    @Environment(UserSettings.self) var userSettings
    
    var body: some View {
        
        GeometryReader {proxy in
            Rectangle()
                .fill(userSettings.appColor)
                .frame(height: 20)
                .frame(width: proxy.size.width * (CGFloat(percentage)/100))
        }
        .background(Color.gray)
    }
}

